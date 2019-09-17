const { URL } = require('url')
const { spawn } = require('child_process')
const { whisper, yn } = require('@dawaltconley/cue')

class CustomError extends Error {
    constructor (message) {
        super(message)
        this.name = this.constructor.name
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(message)).stack;
        }
    }
}

class SecretNotFoundError extends CustomError {}
class SecretAlreadySetError extends CustomError {}
class InvalidSecretType extends CustomError {}

const convertProtocol = protocol => {
    const pDict = {
        'https:': 'htps',
        'http:': 'http'
    }
    for (p in pDict) {
        if (protocol === p) {
            return pDict[p]
        } else if (protocol === pDict[p]) {
            return p
        }
    }
    return null
}

const parseSecurityOutput = output => {
    const obj = {
        keychain: /(?<=keychain: ).*/,
        label: /(?<=0x00000007 <blob>=).*/,
        account: /(?<="acct"<blob>\=).*/,
        service: /(?<="svce"<blob>\=).*/,
        host: /(?<="srvr"<blob>\=).*/,
        path: /(?<="path"<blob>\=).*/,
        protocol: /(?<="ptcl"<blob>\=).*/,
        password: /(?<=password: ).*/
    }
    for (let k in obj) {
        let v = output.match(obj[k])
        if (!v) {
            obj[k] = undefined
            continue
        }
        v = v[0]
        if (v === '<NULL>') {
            obj[k] = null
        } else if (/0x([0-9a-fA-F]+)/.test(v)) {
            let hexVal = v.match(/(?<=0x)[0-9a-fA-F]+/)[0]
            obj[k] = Buffer.from(hexVal, 'hex').toString()
        } else {
            obj[k] = v.match(/"(.*)"/)[1]
        }
    }
    obj.protocol = convertProtocol(obj.protocol)
    return obj
}

class Secret {
    constructor(service, account = '') {
        this.account = account
        this.executablePath = '/usr/bin/security'
        this.prompt = 'secret: '
        try {
            let url = new URL(service)
            this.type = 'internet'
            this.host = url.host
            this.protocol = url.protocol
            this.href = url.href
            this.path = url.pathname
        } catch (e) {
            if (e.name === 'TypeError [ERR_INVALID_URL]') {
                this.type = 'generic'
                this.service = service
            } else {
                throw e
            }
        }
        this.name = this.service || this.host
    }

    getKey() {
        return new Promise((resolve, reject) => {
            let result = ''
            const security = spawn(this.executablePath, [ 'find-'+this.type+'-password', '-a', this.account, '-s', this.name, '-g' ])
            security.on('error', e => reject(e)) // failed to spawn child process
            security.stdout.on('data', d => result += d.toString())
            security.stderr.on('data', d => result += d.toString())
            security.on('close', code => {
                if (code === 0) {
                    resolve({
                        type: this.type,
                        ...parseSecurityOutput(result)
                    })
                } else {
                    reject(new SecretNotFoundError(`could not find ${this.service} in default keychain`))
                }
            })
        })
    }

    setKey(secret, force = false) {
        return new Promise((resolve, reject) => {
            let opt = [
                'add-'+this.type+'-password',
                '-a', this.account,
                '-s', this.name,
                '-w', secret
            ]
            if (force) opt.push('-U')
            if (this.type === 'internet') {
                let protocol = convertProtocol(this.protocol)
                opt = [ ...opt, '-p', this.path ]
                if (protocol) opt = [ ...opt, '-r', protocol ]
            }
            const security = spawn(this.executablePath, opt)
            security.on('error', e => reject(e)) // failed to spawn child process
            security.on('close', code => {
                if (code === 0) {
                    resolve(`${this.name} secret set.`)
                } else if (code === 45) {
                    reject(new SecretAlreadySetError(`${this.name} has already been set.`))
                } else {
                    reject(new Error(`Security exited with code ${code}`))
                }
            })
        })
    }

    delete() {
        return new Promise((resolve, reject) => {
            const security = spawn(this.executablePath, [ 'delete-'+this.type+'-password', '-a', this.account, '-s', this.name ])
            security.on('error', e => reject(e))
            security.on('close', code => {
                if (code === 0) {
                    resolve(`${this.name} secret deleted.`)
                } else if (code === 44) {
                    reject(new SecretNotFoundError(`could not find ${this.service} in default keychain`))
                } else {
                    reject(new Error(`Security exited with code ${code}`))
                }
            })
        })
    }

    config() {
        return this.getKey()
            .then(() => yn(`The ${this.name} secret has already been set.\nDo you want to override it?`))
            .catch(e => {
                if (e.name = 'SecretNotFoundError') {
                    return true
                } else {
                    throw e
                }
            })
            .then(async set => {
                if (set) return this.setKey(await whisper(this.prompt), true)
            })
    }

    get() {
        return this.getKey().catch(async e => {
            if (e.name = 'SecretNotFoundError') {
                if (await yn(`Secret not found for ${this.name}, do you want to set it now?`)) {
                    return this.setKey().then(this.get.bind(this))
                }
            } else {
                throw e
            }
        })
    }
}

module.exports = Secret

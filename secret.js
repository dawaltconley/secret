const { URL } = require('url')
const { spawn } = require('child_process')
const readline = require('readline')
const yn = require('./yn')

class SecretNotFoundError extends Error {
    constructor (message) {
        super(message)
        this.name = this.constructor.name
    }
}

class InvalidSecretType extends Error {
    constructor (message) {
        super(message)
        this.name = this.constructor.name
    }
}

const convertProtocol = protocol => {
    const pDict = {
        'https': 'htps',
        'http': 'http',
        'ftp': 'ftp '
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
        account: /(?<="acct"<blob>\=).*/,
        service: /(?<="svce"<blob>\=).*/,
        domain: /(?<="srvr"<blob>\=).*/,
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

const keyTypes = ['generic', 'internet']

const getKey = (label, type, ex, attempt = 0) => new Promise((resolve, reject) => {
    let result = ''
    if (type === undefined) {
        type = keyTypes[attempt]
    } else if (!keyTypes.includes(type)) {
        reject(new InvalidSecretType(`Secret type was '${type}': must be one of ${keyTypes.join(', ')}`))
    }
    type = type === undefined ? keyTypes[attempt] : type
    const security = spawn(ex, [ 'find-'+type+'-password', '-l', label, '-g' ])
    security.on('error', e => reject(e)) // failed to spawn child process
    security.stdout.on('data', d => result += d.toString())
    security.stderr.on('data', d => result += d.toString())
    security.on('close', code => {
        if (code === 0) {
            resolve({ 
                label: label,
                type: type,
                ...parseSecurityOutput(result)
            })
        } else {
            // password not found, retry
            attempt++
            if (attempt < keyTypes.length) {
                resolve(getKey(label, undefined, ex, attempt))
            } else {
                reject(new SecretNotFoundError('could not find secret in default keychain'))
            }
        }
    })
})

const setKey = (label, type, ex) => new Promise(async (resolve, reject) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    })
    const prompt = {
        type: q => new Promise(resolve => rl.question(q, a => {
            let i = keyTypes.indexOf(a.trim().toLowerCase())
            if (i >= 0) {
                resolve(keyTypes[i])
            } else {
                resolve(prompt.type(`'${a}' is not a valid option: please pick one of ${keyTypes.join(', ')}: `))
            }
        })),
        url: q => new Promise((resolve, reject) => rl.question(q, a => {
            try {
                let url = new URL(a)
                resolve(url)
            } catch (e) {
                if (e.name === 'TypeError [ERR_INVALID_URL]') {
                    resolve(prompt.domain(`'${a}' is not a valid url: please enter a valid url: `))
                } else {
                    reject(e)
                }
            }
        })),
        misc: q => new Promise(resolve => rl.question(q, a => resolve(a)))
    }
    if (type === undefined) {
        type = await prompt.type('type (generic/internet): ')
    }
    let opt = [ 'add-'+type+'-password', '-l', label ] // force update? -U
    if (type === 'generic') {
        opt = [ ...opt, '-s', await prompt.misc('service (optional): ') ]
    } else {
        let url = await prompt.url('url: ')
        let protocol = convertProtocol(url.protocol) || ''
        opt = [ ...opt,
            '-s', url.host,
            '-p', url.pathname,
            '-r', protocol
        ]
    }
    opt = [ ...opt, '-a', await prompt.misc('account (optional): ') ]
    let secret = await prompt.misc('secret: ')
    opt = [ ...opt, '-w', secret ]
    rl.close()
    const security = spawn(ex, opt)
    security.on('error', e => reject(e)) // failed to spawn child process
    security.on('close', code => {
        if (code === 0) {
            console.log(`${label} secret set.`)
            resolve(secret)
        } else {
            reject(new Error(`Security exitted with code ${code}`))
        }
    })
})

class Secret {
    constructor(label, type) {
        this.label = label
        this.type = type
        this.executablePath = '/usr/bin/security'
    }

    config() {
        getKey(this.label, this.type, this.executablePath)
            .then(async secret => {
                this.type = secret.type
                if (await yn(`The ${this.label} secret has already been set.\nDo you want to override it?`)) {
                    return setKey(this.label, this.type, this.executablePath)
                        .catch(e => console.error(e))
                } else {
                    return secret
                }
            })
            .catch(e => {
                if (e.name = 'SecretNotFoundError') {
                    return setKey(this.label, this.type, this.executablePath)
                        .catch(e => console.error(e))
                } else {
                    throw e
                }
            })
    }

    get() {
        return getKey(this.label, this.type, this.executablePath)
            .catch(e => console.error(e))
    }
}

module.exports = Secret

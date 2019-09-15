const { URL } = require('url')
const { spawn } = require('child_process')
const readline = require('readline')
const yn = require('./yn')

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
    if (obj.protocol === 'htps') obj.protocol = 'https'
    return obj
}

const getKey = (label, type, ex, attempt = 0) => new Promise((resolve, reject) => {
    let result = ''
    const keyTypes = ['generic', 'internet']
    if (type === undefined) {
        type = keyTypes[attempt]
    } else if (!keyTypes.includes(type)) {
        reject(new Error(`Invalid key type '${type}': options are ${keyTypes.join(', ')}`))
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
                reject(new Error('Password not found'))
            }
        }
    })
})

class Secret {
    constructor(label, type) {
        this.label = label
        this.type = type
        this.executablePath = '/usr/bin/security'
    }

    get() {
        return getKey(this.label, this.type, this.executablePath)
    }
}

module.exports = Secret

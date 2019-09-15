const readline = require('readline')

const yn = q => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    return new Promise(resolve => rl.question(`${q} (y/n): `, (a) => {
        rl.close()
        if (/^(?:y|yes)$/i.test(a.trim())) {
            resolve(true)
        } else if (/^(?:n|no)$/i.test(a.trim())) {
            resolve(false)
        } else {
            resolve(yn('Please answer with a y(es) or n(o): '))
        }
    }))
}

module.exports = yn

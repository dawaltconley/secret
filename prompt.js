const readline = require('readline')

const question = (quiet, rl, input) => {
    const normalWrite = rl._writeToOutput
    rl.setPrompt(input.trim() + ' ')
    rl.prompt()
    if (quiet) rl._writeToOutput = w =>
        rl.output.write(w.replace(/./g, '*'))
    return new Promise(resolve => rl.on('line', a => {
        rl._writeToOutput = normalWrite
        resolve(a)
    }))
}

const questions = async (quiet, input) => {
    let answers
    let rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    let prompt = question.bind(null, quiet, rl)
    if (input instanceof Array) {
        answers = []
        for (let q of input) {
            await prompt(q).then(a => answers.push(a))
        }
    } else if (input instanceof Object) {
        answers = {}
        for (let q in input) {
            await prompt(input[q]).then(a => answers[q] = a)
        }
    } else if (typeof input === 'string') {
        await prompt(input).then(a => answers = a)
    } else {
        rl.close()
        throw new TypeError(`Input must be object, array, or string: found ${typeof input}`)
    }
    rl.close()
    return answers
}

const ask = questions.bind(null, false)
const whisper = questions.bind(null, true)

const yn = input => {
    if (typeof input !== 'string') {
        throw new TypeError(`yn input must be string: found ${typeof input}`)
    }
    return ask(input.trim() + ' (y/n):')
        .then(a => {
            if (/^(?:y|yes)$/i.test(a.trim())) {
                return true
            } else if (/^(?:n|no)$/i.test(a.trim())) {
                return false
            } else {
                return yn('Please answer with a y(es) or n(o):')
            }
        })
}

module.exports = {
    ask: ask,
    whisper: whisper,
    yn: yn
}

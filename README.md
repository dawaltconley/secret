# Storing information in the Mac Keychain

Uses the OSX `security` cli to save and retrieve passwords and other sensitive data.

## Examples

Instantiates a `Secret` object. Takes an argument for the service/url and an optional second argument for the account name.

```javascript
const Secret = require('./secret.js')

const generic = new Secret('jekyll-comments')
// creates a generic password with no account info

const internet = new Secret('https://api.github.com', 'dawaltconley')
// creates an internet password for the account 'dawaltconley'
```

Following the behavior of `security`, Secret returns slightly different information depending on whether that Secret is of a generic or internet type.

```javascript
// generic.get().then(s => console.log(s))
{
    type: 'generic',
    keychain: '/Users/dylan/Library/Keychains/login.keychain-db',
    label: 'jekyll-comments',
    account: null,
    service: 'jekyll-comments',
    password: 'passw0rd!'
}

// internet.get().then(s => console.log(s))
{
    type: 'internet',
    keychain: '/Users/dylan/Library/Keychains/login.keychain-db',
    label: 'api.github.com',
    account: 'dawaltconley',
    host: 'api.github.com',
    path: '/',
    protocol: 'https:',
    password: 'passw0rd!'
}
```

## Configuration

### Secret.prompt

Determines how the user is prompted to enter a password. Defaults to `'secret: '`.

### Secret.executablePath

The path of the `security` child process. Defaults to `'/usr/bin/security'`.

## Methods

### config()

Runs an interactive commandline prompt to assign or overwrite the secret. Adds an extra prompt to confirm overwriting, if the secret has already been set.

### get(interactive)

Gets a secret from the command line. Accepts a boolean as its argument, which affects its behavior if the secret hasn't been set yet.

If set to true, `get` will prompt the user to input a secret (similar to config). If set to false, `get` will reject with a `SecretNotFoundError` (default: `true`).

### set(password, force)

Sets the secret to a provided string, storing it in the Keychain. Second argument determines whether to overwrite an existing secret in the Keychain, If `false`, rejects with a `SecretAlreadySetError` (default: `false`).

### delete()

Deletes the secret from the Keychain. Doesn't delete the secret object; secrets can still be reset or configured after deletion.

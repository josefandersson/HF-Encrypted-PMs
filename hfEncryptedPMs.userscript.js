// ==UserScript==
// @name         Hackforums Encrypted PMs
// @version      1
// @description  Encrypt your PMs with PGP encryption.
// @author       DrDoof
// @match        https://hackforums.net/private.php?action=send*
// @match        https://hackforums.net/private.php?action=read*
// @require      https://github.com/openpgpjs/openpgpjs/raw/master/dist/openpgp.min.js
// @resource     MainCSS https://github.com/josefandersson/HF-Encrypted-PMs/raw/master/style.css
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

GM_addStyle(GM_getResourceText('MainCSS'));


const regexPublicKey = /-----BEGIN PGP PUBLIC KEY BLOCK-----(?:.|\s)*-----END PGP PUBLIC KEY BLOCK-----/m;
const regexMessage = /-----BEGIN PGP MESSAGE-----(?:.|\s)*-----END PGP MESSAGE-----/m;

var buttonElement;
var infoElement;
var popupElement;
var submitElement;
var publicKey;

function saveUser(data) {
    GM_setValue(`dataFor${data.username}`, data);
}

function getUser(username) {
    return GM_getValue(`dataFor${username}`);
}

function getPassphrase() {
    return new Promise((resolve, reject) => {
        displayPrompt('Enter passphrase:').then(resolve).catch(reject);
    });
}

function getNumRecipients() {
    return document.querySelectorAll('.select2-search-choice').length;
}

function setKeys(keys) {
    GM_setValue('keys', keys);
}

function hasKeys() {
    return GM_getValue('keys') !== null;
}

var privateKeyObject;
function unlockPrivateKey() {
    return new Promise((resolve, reject) => {
        if (privateKeyObject) {
            resolve(privateKeyObject);
        } else {
            getKeys().then(keys => {
                privateKeyObject = openpgp.key.readArmored(keys.privateKey).keys[0];
                getPassphrase().then(passphrase => {
                    privateKeyObject.decrypt(passphrase).then(() => {
                        resolve(privateKeyObject);
                    }).catch(err => reject(err));
                }).catch(() => reject('no passphrase'));
            }).catch(err => reject(err));
        }
    });
}

function encrypt(message, recipientPublicKey) {
    return new Promise((resolve, reject) => {
        unlockPrivateKey().then(privateKeyObject => {
            openpgp.encrypt({
                data: message,
                publicKeys: openpgp.key.readArmored(recipientPublicKey).keys,
                privateKeys: privateKeyObject
            }).then(ciph => resolve(ciph.data)).catch(err => reject(err));
        }).catch(err => reject(err));
    });
}

function decrypt(encryptedMessage) {
    return new Promise((resolve, reject) => {
        unlockPrivateKey().then(privateKeyObject => {
            openpgp.decrypt({
                message: openpgp.message.readArmored(encryptedMessage),
                privateKeys: privateKeyObject
            }).then(msg => resolve(msg.data)).catch(err => reject(err));
        }).catch(err => reject(err));
    });
}

function updateStateOfButton() {
    if (!buttonElement) {
        let sibling = document.querySelector('#content > div > form > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(4)');
        let row = sibling.cloneNode(true);
        sibling.insertAdjacentElement('afterend', row);
        row.innerHTML = '<td class="trow1"><strong>Encryption:</strong></td><td class="trow1"><button class="encryptMessageButton"></button><p id="encryptionInfo"></p></td>';
        buttonElement = document.querySelector('.encryptMessageButton');
        infoElement = document.querySelector('#encryptionInfo');
        buttonElement.addEventListener('click', buttonClickEvent);
    }

    publicKey = getRecipientPublicKey();
    if (!publicKey) {
        buttonElement.setAttribute('mode', 'bad');
        infoElement.innerText = 'This message CANNOT be encrypted because the recipient\'s public encryption key is unknown.\nGenerate a public encryption key request message from the recipient by clicking the button above.\nNOTE: This will overwrite your message with a pre-generated message.';
    } else {
        buttonElement.setAttribute('mode', 'good');
        infoElement.innerText = '';
    }

    if (getNumRecipients() === 1) {
        buttonElement.disabled = false;
    } else {
        if (hasBeenChanged)
            revertTextarea();
        buttonElement.disabled = true;
        infoElement.innerText = 'To send an encrypted message there has to be exactly ONE recipient!';
    }
}

var hasBeenChanged = false;
var previousData;

function revertTextarea() {
    let textarea = document.querySelector('#content > div > form > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(6) > td:nth-child(2) > div > textarea');
    hasBeenChanged = false;
    textarea.disabled = false;
    textarea.value = previousData;
    updateStateOfButton();
}

function buttonClickEvent(ev) {
    ev.preventDefault();
    let textarea = document.querySelector('#content > div > form > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(6) > td:nth-child(2) > div > textarea');

    if (hasBeenChanged) {
        revertTextarea();
    } else {
        if (!publicKey) {
            getKeys().then(keys => {
                hasBeenChanged = true;
                textarea.disabled = true;
                previousData = textarea.value;
                textarea.value = `Hello. I would like to have a private conversation with you!\n\nPlease install the HF Encrypted PMs userscript http://*****.***/\nand then reload this page.\n\n${keys.publicKey}`;
                buttonElement.setAttribute('mode', 'middle');
            }).catch(err => console.log(err));
        } else {
            //let doneWaiting = displayWait('Encrypting message... This should only take a few seconds.');
            encrypt(textarea.value, getRecipientPublicKey()).then(encryptedMessage => {
                //doneWaiting();
                hasBeenChanged = true;
                textarea.disabled = true;
                previousData = textarea.value;
                textarea.value = `This message was sent using the HF Encrypted PMs userscript http://*****.***/.\n\n${encryptedMessage}`;
                buttonElement.setAttribute('mode', 'middle');
            }).catch(err => {
                //doneWaiting();
                console.log('Encryption failed:', err);
            })
        }
    }
}

function getRecipientPublicKey() {
    if (getNumRecipients() === 1) {
        let recipient = document.querySelector('.select2-search-choice > div').innerText;
        let user = getUser(recipient);
        if (user)
            return user.publicKey;
        else
            return null;
    }
    return null;
}



function getKeys() {
    return new Promise((resolve, reject) => {
        let keys = GM_getValue('keys');
        if (!keys) {
            displayPopup('No previous encryption keys found, generating new...').then(() => {
                displayPrompt('Enter a secure passphrase of at least 8 characters for encrypting your messages. DO NOT use the same password as for your hackforums account, or any other account. Use numbers, letters and special characters to make it more secure. You will be prompted for this passphrase everytime you send an encrypted message.').then(pw => {
                    let myUsername = document.querySelector('#panel > div.upper > div > span.welcome > strong > a').innerText;
                    let doneWaiting = displayWait('Generating key pair... This should only take a few seconds.');
                    openpgp.generateKey({
                        userIds: [{ name:myUsername, email:`${myUsername}@example.com` }],
                        numBits: 4096 / 2,
                        passphrase: pw
                    }).then(key => {
                        setKeys({ privateKey:key.privateKeyArmored.trim(), publicKey:key.publicKeyArmored.trim() });
                        doneWaiting();
                        displayPopup('A new pair of encryption keys has been generated.').then(() => {
                            window.location.reload();
                            // resolve(GM_getValue('keys'));
                        });
                    }).catch(err => {
                        doneWaiting();
                        reject(err);
                    });
                }).catch(err => reject(err));
            });
        } else {
            resolve(keys);
        }
    });
}

function displayWait(text) {
    document.body.innerHTML += `<div class="hfEncPM"><div><h2>HF Encrypted PMs</h3><p>${text}</p><img src="https://i.imgur.com/aq6dVtN.gifv"></div></div>`;
    let popupElement = document.querySelector('.hfEncPM');
    return function() { popupElement.remove(); };
}

function displayPopup(text) {
    return new Promise((resolve, reject) => {
        document.body.innerHTML += `<div class="hfEncPM"><div><h2>HF Encrypted PMs</h3><p>${text}</p><button>Ok</button></div></div>`;
        let popupElement = document.querySelector('.hfEncPM');
        document.querySelector('.hfEncPM button').addEventListener('click', e => {
            popupElement.remove();
            resolve();
        });
    });
}

function displayPrompt(text, inputType='password') {
    return new Promise((resolve, reject) => {
        document.body.innerHTML += `<div class="hfEncPM"><div><h2>HF Encrypted PMs</h3><p>${text}</p><p><input type="${inputType}" id="input1" autofocus></p><button>Ok</button><button>Cancel</button></div></div>`;
        let popupElement = document.querySelector('.hfEncPM');
        let next = () => {
            resolve(document.querySelector('.hfEncPM input').value);
            popupElement.remove();
        };
        document.querySelector('.hfEncPM input').addEventListener('keypress', e => {
            if (e.keyCode === 13) next();
        });
        document.querySelector('.hfEncPM button:first-of-type').addEventListener('click', e => next());
        document.querySelector('.hfEncPM button:last-of-type').addEventListener('click', e => {
            popupElement.remove();
            reject('cancel');
        });
    });
}


if (window.location.href.indexOf('read') > -1) {
    let message = document.querySelector('#pid_').innerText;
    let username = document.querySelector('#post_ > div.post_author > div.author_information > strong').innerText;

    let regexResults = regexPublicKey.exec(message);
    if (regexResults) {
        saveUser({
            username: username,
            uid: /uid=([0-9]*)/.exec(document.querySelector('#post_ > div.post_author > div.author_information > strong > span > a').href)[1],
            publicKey: regexResults[0]
        });
        document.querySelector('#pid_').innerText = 'This is a HF Encrypted PMs message. The users public PGP key has been saved. You may now send encrypted messages to this user.';
    }

    regexResults = regexMessage.exec(message);
    if (regexResults) {
        let user = getUser(username);
        decrypt(regexResults[0]).then(decryptedMessage => {
            document.querySelector('#pid_').innerText = decryptedMessage;
        }).catch(err => {
            throw err;
        });
    }
} else {
    let observer = new MutationObserver(updateStateOfButton);
    observer.observe(document.querySelector('.select2-choices'), { childList: true });

    submitElement = document.querySelector('#content > div > form > table > tbody > tr > td:nth-child(2) > div > input:nth-child(2)');

    updateStateOfButton();
    getKeys();
}
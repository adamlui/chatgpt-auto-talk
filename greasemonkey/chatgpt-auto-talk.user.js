// ==UserScript==
// @name                ChatGPT Auto-Talk 📣
// @description         Automatically play ChatGPT responses
// @author              Adam Lui
// @namespace           https://github.com/adamlui
// @version             2024.7.17
// @license             MIT
// @match               *://chatgpt.com/*
// @match               *://chat.openai.com/*
// @require             https://cdn.jsdelivr.net/npm/@kudoai/chatgpt.js@2.9.3/dist/chatgpt.min.js#sha256-EDN+mCc+0Y4YVzJEoNikd4/rAIaJDLAdb+erWvupXTM=
// @connect             cdn.jsdelivr.net
// @connect             greasyfork.org
// @grant               GM_setValue
// @grant               GM_getValue
// @grant               GM_registerMenuCommand
// @grant               GM_unregisterMenuCommand
// @grant               GM_openInTab
// @grant               GM_xmlhttpRequest
// @grant               GM.xmlHttpRequest
// @noframes
// @contributionURL     https://github.com/sponsors/adamlui
// ==/UserScript==

// NOTE: This script relies on the powerful chatgpt.js library @ https://chatgpt.js.org © 2023–2024 KudoAI & contributors under the MIT license.

(async () => {

    // Init CONFIG
    const config = {
        appName: 'ChatGPT Auto-Talk', appSymbol: '📣', keyPrefix: 'chatGPTautoTalk',
        gitHubURL: 'https://github.com/adamlui/chatgpt-auto-talk',
        greasyForkURL: '#',
        latestAssetCommitHash: '1427c26' } // for cached messages.json + navicon
    config.updateURL = config.greasyForkURL.replace('https://', 'https://update.')
        .replace(/(\d+)-?([a-zA-Z-]*)$/, (_, id, name) => `${ id }/${ !name ? 'script' : name }.meta.js`)
    config.supportURL = config.gitHubURL + '/issues/new'
    config.assetHostURL = config.gitHubURL.replace('github.com', 'cdn.jsdelivr.net/gh') + `@${config.latestAssetCommitHash}/`
    config.userLanguage = chatgpt.getUserLanguage()
    loadSetting('autoTalkDisabled', 'toggleHidden')

    // Init FETCHER
    const xhr = getUserscriptManager() == 'OrangeMonkey' ? GM_xmlhttpRequest : GM.xmlHttpRequest

    // Define MESSAGES
    let msgs = {}
    const msgsLoaded = new Promise(resolve => {
        const msgHostDir = config.assetHostURL + 'greasemonkey/_locales/',
              msgLocaleDir = ( config.userLanguage ? config.userLanguage.replace('-', '_') : 'en' ) + '/'
        let msgHref = msgHostDir + msgLocaleDir + 'messages.json', msgXHRtries = 0
        xhr({ method: 'GET', url: msgHref, onload: onLoad })
        function onLoad(resp) {
            try { // to return localized messages.json
                const msgs = JSON.parse(resp.responseText), flatMsgs = {}
                for (const key in msgs)  // remove need to ref nested keys
                    if (typeof msgs[key] == 'object' && 'message' in msgs[key])
                        flatMsgs[key] = msgs[key].message
                resolve(flatMsgs)
            } catch (err) { // if bad response
                msgXHRtries++ ; if (msgXHRtries == 3) return resolve({}) // try up to 3X (original/region-stripped/EN) only
                msgHref = config.userLanguage.includes('-') && msgXHRtries == 1 ? // if regional lang on 1st try...
                    msgHref.replace(/([^_]+_[^_]+)_[^/]*(\/.*)/, '$1$2') // ...strip region before retrying
                        : ( msgHostDir + 'en/messages.json' ) // else use default English messages
                xhr({ method: 'GET', url: msgHref, onload: onLoad })
            }
        }
    }) ; if (!config.userLanguage.startsWith('en')) try { msgs = await msgsLoaded } catch (err) {}

    // Init MENU objs
    const menuIDs = [] // to store registered cmds for removal while preserving order
    const menuState = {
        symbol: ['❌', '✔️'], word: ['OFF', 'ON'],
        separator: getUserscriptManager() == 'Tampermonkey' ? ' — ' : ': '
    }

    registerMenu() // create browser toolbar menu

    // Init UI flags
    await Promise.race([chatgpt.isLoaded(), new Promise(resolve => setTimeout(resolve, 5000))]) // initial UI loaded
    await chatgpt.sidebar.isLoaded()
    const isFirefox = chatgpt.browser.isFirefox(),
          isGPT4oUI = document.documentElement.className.includes(' '),
          firstLink = chatgpt.getNewChatLink()

    // Add/update TWEAKS style
    const tweaksStyleUpdated = 202405171 // datestamp of last edit for this file's `tweaksStyle`
    let tweaksStyle = document.getElementById('tweaks-style') // try to select existing style
    if (!tweaksStyle || parseInt(tweaksStyle.getAttribute('last-updated'), 10) < tweaksStyleUpdated) { // if missing or outdated
        if (!tweaksStyle) { // outright missing, create/id/attr/append it first
            tweaksStyle = document.createElement('style') ; tweaksStyle.id = 'tweaks-style'
            tweaksStyle.setAttribute('last-updated', tweaksStyleUpdated.toString())
            document.head.append(tweaksStyle)
        }
        tweaksStyle.innerText = (
            '.chatgpt-modal button {'
              + 'font-size: 0.77rem ; text-transform: uppercase ;'
              + 'border-radius: 0 !important ; padding: 5px !important ; min-width: 102px }'
          + '.modal-buttons { margin-left: -13px !important }'
          + '* { scrollbar-width: thin }' // make FF scrollbar skinny to not crop toggle
          + '.sticky div:active, .sticky div:focus {' // post-GPT-4o UI sidebar button container
              + 'transform: none !important }' // disable distracting click zoom effect
        )
    }

    // Stylize ALERTS
    if (!document.getElementById('chatgpt-alert-override-style')) {
        const chatgptAlertStyle = document.createElement('style')
        chatgptAlertStyle.id = 'chatgpt-alert-override-style'
        chatgptAlertStyle.innerText = (
            ( chatgpt.isDarkMode() ? '.chatgpt-modal > div { border: 1px solid white }' : '' )
          + '.chatgpt-modal button {'
              + 'font-size: 0.77rem ; text-transform: uppercase ;'
              + 'border-radius: 0 !important ; padding: 5px !important ; min-width: 102px }'
          + '.modal-buttons { margin-left: -13px !important }'
        )
        document.head.append(chatgptAlertStyle)
    }

    // Create NAV TOGGLE div, add styles
    const navToggleDiv = document.createElement('div')
    navToggleDiv.style.height = '37px'
    navToggleDiv.style.margin = '2px 0' // add v-margins
    navToggleDiv.style.userSelect = 'none' // prevent highlighting
    navToggleDiv.style.cursor = 'pointer' // add finger cursor
    updateToggleHTML() // create children
    if (firstLink) { // borrow/assign CLASSES from sidebar div
        const firstIcon = firstLink.querySelector('div:first-child'),
              firstLabel = firstLink.querySelector('div:nth-child(2)')
        navToggleDiv.classList.add(...firstLink.classList, ...firstLabel.classList)
        navToggleDiv.querySelector('img')?.classList.add(...firstIcon.classList)
    }

    insertToggle()

    // Add LISTENER to toggle switch/label/config/menu
    navToggleDiv.onclick = () => {
        const toggleInput = document.getElementById('atToggleInput')
        toggleInput.checked = !toggleInput.checked ; config.autoTalkDisabled = !toggleInput.checked
        updateToggleHTML() ; refreshMenu()
        notify(`${ msgs.menuLabel_autoTalk || 'Auto-Talk' }: ${menuState.word[+!config.autoTalkDisabled]}`)
        saveSetting('autoTalkDisabled', config.autoTalkDisabled)
    }

    // Observe <main> for need to AUTO-PLAY response
    await Promise.race([chatgpt.isLoaded(), new Promise(resolve => setTimeout(resolve, 1000))])
    const autoPlayObserver = new MutationObserver(mutationsList => {
        if (config.autoTalkDisabled) return
        for (const mutation of mutationsList) { if (mutation.type === 'childList')
            mutation.addedNodes.forEach(node => { if (node?.tagName == 'DIV') {
                const playIcon = node.querySelector('path[d*="M11 4.91a.5.5"]')
                if (playIcon) setTimeout(() => {
                    if (!chatgpt.getStopGeneratingButton())
                        playIcon.closest('button').click()
                }, 50)
    }})}})
    autoPlayObserver.observe(document.querySelector('main'), { childList: true, subtree: true })

    // Monitor <html> to maintain SIDEBAR TOGGLE VISIBILITY on node changes
    const nodeObserver = new MutationObserver(mutations => { mutations.forEach(mutation => {
        if (mutation.type == 'childList' && mutation.addedNodes.length) insertToggle() })})
    nodeObserver.observe(document.documentElement, { childList: true, subtree: true })

    // Define SCRIPT functions

    function loadSetting(...keys) { keys.forEach(key => config[key] = GM_getValue(config.keyPrefix + '_' + key, false)) }
    function saveSetting(key, value) { GM_setValue(config.keyPrefix + '_' + key, value) ; config[key] = value }
    function safeWindowOpen(url) { window.open(url, '_blank', 'noopener') } // to prevent backdoor vulnerabilities
    function getUserscriptManager() { try { return GM_info.scriptHandler } catch (err) { return 'other' }}

    // Define MENU functions

    function registerMenu() {

        // Add command to toggle auto-clear
        const atLabel = menuState.symbol[+!config.autoTalkDisabled] + ' '
                      + ( msgs.menuLabel_autoTalk || 'Auto-Talk' )
                      + menuState.separator + menuState.word[+!config.autoTalkDisabled]
        menuIDs.push(GM_registerMenuCommand(atLabel, () => document.getElementById('atToggleLabel').click()))

        // Add command to launch About modal
        const aboutLabel = `💡 ${ msgs.menuLabel_about || 'About' } ${ msgs.appName || config.appName }`
        menuIDs.push(GM_registerMenuCommand(aboutLabel, launchAboutModal))
    }

    function refreshMenu() {
        if (getUserscriptManager() == 'OrangeMonkey') return
        for (const id of menuIDs) { GM_unregisterMenuCommand(id) } registerMenu()
    }

    function launchAboutModal() {

        // Show alert
        const chatgptJSver = (/chatgpt-([\d.]+)\.min/.exec(GM_info.script.header) || [null, ''])[1],
              headingStyle = 'font-size: 1.15rem',
              pStyle = 'position: relative ; left: 3px',
              pBrStyle = 'position: relative ; left: 4px ',
              aStyle = 'color: ' + ( chatgpt.isDarkMode() ? '#c67afb' : '#8325c4' ) // purple
        const aboutModalID = siteAlert(
            msgs.appName || config.appName, // title
            `<span style="${ headingStyle }"><b>🏷️ <i>${ msgs.about_version || 'Version' }</i></b>: </span>`
                + `<span style="${ pStyle }">${ GM_info.script.version }</span>\n`
            + `<span style="${ headingStyle }"><b>⚡ <i>${ msgs.about_poweredBy || 'Powered by' }</i></b>: </span>`
                + `<span style="${ pStyle }"><a style="${ aStyle }" href="https://chatgpt.js.org" target="_blank" rel="noopener">`
                + 'chatgpt.js</a>' + ( chatgptJSver ? ( ' v' + chatgptJSver ) : '' ) + '</span>\n'
            + `<span style="${ headingStyle }"><b>📜 <i>${ msgs.about_sourceCode || 'Source code' }</i></b>:</span>\n`
                + `<span style="${ pBrStyle }"><a href="${ config.gitHubURL }" target="_blank" rel="nopener">`
                + config.gitHubURL + '</a></span>',
            [ // buttons
                function checkForUpdates() { updateCheck() },
                function getSupport() { safeWindowOpen(config.supportURL) },
                function leaveAReview() { safeWindowOpen(config.greasyForkURL + '/feedback#post-discussion') },
                function moreChatGPTapps() { safeWindowOpen('https://github.com/adamlui/chatgpt-apps') }
            ], '', 478 // set width
        )

        // Re-format buttons to include emoji + localized label + hide Dismiss button
        for (const button of document.getElementById(aboutModalID).querySelectorAll('button')) {
            if (/updates/i.test(button.textContent)) button.textContent = (
                '🚀 ' + ( msgs.buttonLabel_updateCheck || 'Check for Updates' ))
            else if (/support/i.test(button.textContent)) button.textContent = (
                '🧠 ' + ( msgs.buttonLabel_getSupport || 'Get Support' ))
            else if (/review/i.test(button.textContent)) button.textContent = (
                '⭐ ' + ( msgs.buttonLabel_leaveReview || 'Leave a Review' ))
            else if (/apps/i.test(button.textContent)) button.textContent = (
                '🤖 ' + ( msgs.buttonLabel_moreApps || 'More ChatGPT Apps' ))
            else button.style.display = 'none' // hide Dismiss button
        }
    }

    function updateCheck() {

        // Fetch latest meta
        const currentVer = GM_info.script.version
        xhr({
            method: 'GET', url: config.updateURL + '?t=' + Date.now(),
            headers: { 'Cache-Control': 'no-cache' },
            onload: response => { const updateAlertWidth = 377

                // Compare versions
                const latestVer = /@version +(.*)/.exec(response.responseText)[1]
                for (let i = 0 ; i < 4 ; i++) { // loop thru subver's
                    const currentSubVer = parseInt(currentVer.split('.')[i], 10) || 0,
                          latestSubVer = parseInt(latestVer.split('.')[i], 10) || 0
                    if (currentSubVer > latestSubVer) break // out of comparison since not outdated
                    else if (latestSubVer > currentSubVer) { // if outdated

                        // Alert to update
                        const updateModalID = siteAlert(( msgs.alert_updateAvail || 'Update available' ) + '! 🚀', // title
                            ( msgs.alert_newerVer || 'An update to' ) + ' ' // msg
                                + ( msgs.appName || config.appName ) + ' '
                                + `(v${ latestVer }) ${ msgs.alert_isAvail || 'is available' }!  `
                                + '<a target="_blank" rel="noopener" style="font-size: 0.7rem" '
                                    + 'href="' + config.gitHubURL + '/commits/main/greasemonkey/'
                                    + config.updateURL.replace(/.*\/(.*)meta\.js/, '$1user.js') + '"'
                                    + `> ${ msgs.link_viewChanges || 'View changes' }</a>`,
                            function update() { // button
                                GM_openInTab(config.updateURL.replace('meta.js', 'user.js') + '?t=' + Date.now(),
                                    { active: true, insert: true })}, // focus, make adjacent                            
                            '', updateAlertWidth
                        )

                        // Localize button labels if needed
                        if (!config.userLanguage.startsWith('en')) {
                            const updateAlert = document.querySelector(`[id="${ updateModalID }"]`),
                                  updateBtns = updateAlert.querySelectorAll('button')
                            updateBtns[1].textContent = msgs.buttonLabel_update || 'Update'
                            updateBtns[0].textContent = msgs.buttonLabel_dismiss || 'Dismiss'
                        }

                        return
                }}

                // Alert to no update, return to About modal
                siteAlert(( msgs.alert_upToDate || 'Up-to-date' ) + '!', // title
                    `${ msgs.appName || 'ChatGPT Auto-Talk' } (v${ currentVer }) ` // msg
                        + ( msgs.alert_isUpToDate || 'is up-to-date' ) + '!',
                    '', '', updateAlertWidth
                )
                launchAboutModal()
    }})}

    // Define FEEDBACK functions

    function notify(msg, position = '', notifDuration = '', shadow = '') {

        // Strip state word to append colored one later
        const foundState = menuState.word.find(word => msg.includes(word))
        if (foundState) msg = msg.replace(foundState, '')

        // Show notification
        chatgpt.notify(`${ config.appSymbol } ${ msg }`, position, notifDuration, shadow || chatgpt.isDarkMode() ? '' : 'shadow')
        const notifs = document.querySelectorAll('.chatgpt-notif'),
              notif = notifs[notifs.length -1]

        // Append colored state word
        if (foundState) {
            const coloredState = document.createElement('span')
            coloredState.style.color = foundState == menuState.word[0] ? 'rgb(239, 72, 72)' : '#5cef48'
            coloredState.append(foundState) ; notif.append(coloredState)
        }
    }

    function siteAlert(title = '', msg = '', btns = '', checkbox = '', width = '') {
        return chatgpt.alert(`${ config.appSymbol } ${ title }`, msg, btns, checkbox, width )}

    // Define UI functions

    async function insertToggle() {

        // Insert toggle
        const parentToInsertInto = document.querySelector('nav ' +
            (isGPT4oUI ? '' // nav div itself
                : '> div:not(.invisible)')) // upper nav div
        if (!parentToInsertInto.contains(navToggleDiv))
            parentToInsertInto.insertBefore(navToggleDiv, parentToInsertInto.children[1])

        // Tweak styles
        if (isGPT4oUI) navToggleDiv.style.flexGrow = 'unset' // overcome OpenAI .grow
        if (!firstLink) parentToInsertInto.children[0].style.marginBottom = '5px'
        navToggleDiv.style.paddingLeft = '8px'
        document.getElementById('atToggleNavicon').src = `${ // update navicon color in case scheme changed
            config.assetHostURL }assets/images/icons/speaker/${
            chatgpt.isDarkMode() ? 'white' : 'black' }-icon.svg`
    }

    function updateToggleHTML() {

        // Create/size/position navicon
        const navicon = document.getElementById('atToggleNavicon') || document.createElement('img')
        navicon.id = 'atToggleNavicon'
        navicon.style.width = navicon.style.height = '1.25rem'
        navicon.style.marginLeft = isGPT4oUI ? '2px' : '4px' ; navicon.style.marginRight = '4px'

        // Create/ID/disable/hide/update checkbox
        const toggleInput = document.getElementById('atToggleInput') || document.createElement('input')
        toggleInput.id = 'atToggleInput' ; toggleInput.type = 'checkbox' ; toggleInput.disabled = true
        toggleInput.style.display = 'none' ; toggleInput.checked = !config.autoTalkDisabled

        // Create/ID/stylize switch
        const switchSpan = document.getElementById('atSwitchSpan') || document.createElement('span')
        switchSpan.id = 'atSwitchSpan'
        const switchStyles = {
            position: 'relative', left: `${ chatgpt.browser.isMobile() ? 211 : !firstLink ? 160 : isGPT4oUI ? 147 : 152 }px`,
            backgroundColor: toggleInput.checked ? '#ccc' : '#AD68FF', // init opposite  final color
            bottom: `${ !firstLink ? -0.15 : isFirefox || !isGPT4oUI ? 0.05 : 0 }em`,
            width: '30px', height: '15px', '-webkit-transition': '.4s', transition: '0.4s',  borderRadius: '28px'
        }
        Object.assign(switchSpan.style, switchStyles)

        // Create/ID/stylize knob, append to switch
        const knobSpan = document.getElementById('atToggleKnobSpan') || document.createElement('span')
        knobSpan.id = 'atToggleKnobSpan'
        const knobWidth = 13
        const knobStyles = {
            position: 'absolute', left: '3px', bottom: `${ isFirefox && !firstLink ? 0.075 : 0.055 }em`,
            width: `${ knobWidth }px`, height: `${ knobWidth }px`, content: '""', borderRadius: '28px',
            transform: toggleInput.checked ? // init opposite final pos
                'translateX(0)' : `translateX(${ knobWidth }px) translateY(0)`,
            backgroundColor: 'white',  '-webkit-transition': '0.4s', transition: '0.4s'
        }
        Object.assign(knobSpan.style, knobStyles) ; switchSpan.append(knobSpan)

        // Create/ID/stylize/fill label
        const toggleLabel = document.getElementById('atToggleLabel') || document.createElement('label')
        toggleLabel.id = 'atToggleLabel'
        if (!firstLink) { // add font size/weight since no firstLink to borrow from
            toggleLabel.style.fontSize = '0.875rem' ; toggleLabel.style.fontWeight = 600 }
        toggleLabel.style.marginLeft = `-${ !firstLink ? 23 : 41 }px` // left-shift to navicon
        toggleLabel.style.cursor = 'pointer' // add finger cursor on hover
        toggleLabel.style.width = `${ chatgpt.browser.isMobile() ? 201 : isGPT4oUI ? 145 : 148 }px` // to truncate overflown text
        toggleLabel.style.overflow = 'hidden' // to truncate overflown text
        toggleLabel.style.textOverflow = 'ellipsis' // to truncate overflown text
        toggleLabel.innerText = ( msgs.menuLabel_autoTalk || 'Auto-Talk' ) + ' '
                              + ( toggleInput.checked ? ( msgs.state_enabled  || 'enabled' )
                                                      : ( msgs.state_disabled || 'disabled' ))
        // Append elements
        for (const elem of [navicon, toggleInput, switchSpan, toggleLabel]) navToggleDiv.append(elem)

        // Update visual state
        navToggleDiv.style.display = config.toggleHidden ? 'none' : 'flex'
        setTimeout(() => {
            if (toggleInput.checked) {
                switchSpan.style.backgroundColor = '#AD68FF'
                switchSpan.style.boxShadow = '2px 1px 9px #D8A9FF'
                knobSpan.style.transform = `translateX(${ knobWidth }px) translateY(0)`
            } else {
                switchSpan.style.backgroundColor = '#CCC'
                switchSpan.style.boxShadow = 'none'
                knobSpan.style.transform = 'translateX(0)'
            }
        }, 1) // min delay to trigger transition fx
    }

})()

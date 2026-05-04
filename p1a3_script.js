// ==UserScript==
// @name         1p3a_script
// @namespace    https://github.com/eagleoflqj/p1a3_script
// @version      0.10.5
// @description  方便使用一亩三分地
// @author       Liumeo
// @match        https://www.1point3acres.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getResourceText
// @grant        GM_info
// @require      https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js
// @require      https://raw.githubusercontent.com/eagleoflqj/p1a3_script/master/QA.js
// @require      https://raw.githubusercontent.com/eagleoflqj/p1a3_script/master/dream-ui.min.js
// @resource     dreamui https://raw.githubusercontent.com/eagleoflqj/p1a3_script/master/dream-ui.css
// @resource     setting https://raw.githubusercontent.com/eagleoflqj/p1a3_script/master/setting.html
// ==/UserScript==

(function () {
    'use strict';

    const jq = jQuery.noConflict();
    // 为本地存储添加命名空间
    const getValue = (namespace, name) => GM_getValue(namespace + '::' + name);
    const setValue = (namespace, name, value) => GM_setValue(namespace + '::' + name, value);
    const deleteValue = (namespace, name) => GM_deleteValue(namespace + '::' + name);
    // 可隐藏的模块
    const hideData = [
        { value: '#portal_block_76 > div', text: "水车排行" },
        { value: '#frameLXyXrm', text: "4x3" },
        { value: '#portal_block_421_content', text: "指尖新闻" },
        { value: '#portal_block_444_content', text: "生活攻略" },
        { value: '#portal_block_449_content', text: "疫情动态" },
        { value: '#portal_block_499_content', text: "绿卡排期" },
        { value: '#portal_block_424_content', text: "精品网课" },
    ];
    const hideList = hideData.map(e => e.value); // 可隐藏的模块选择器列表
    const hide = () => hideList.forEach(selector => jq(selector).css('display', getValue('hide', selector) ? 'none' : 'block')); // 按本地存储隐藏模块
    // 添加设置对话框
    GM_registerMenuCommand('设置', () => {
        UI.dialog({
            title: '设置',
            content: GM_getResourceText('setting'),
            maskClose: true,
            showButton: false
        });
        // 隐藏模块
        const settingHideData = JSON.parse(JSON.stringify(hideData)); // 深拷贝
        settingHideData.forEach(e => getValue('hide', e.value) && (e.checked = true)); // 按本地存储打勾
        UI.checkbox("#dui-hide", {
            change: arg => { // 立即应用勾选
                hideList.forEach(selector => arg.some(e => e === selector) ? setValue('hide', selector, true) : deleteValue('hide', selector));
                hide();
            },
            data: settingHideData
        });
    });
    GM_addStyle(GM_getResourceText('dreamui')); // 加载DreamUI样式
    GM_addStyle('.ui-checkbox {margin-right:20px; margin-top:20px}'); // CSS优先级问题
    hide();
    // 针对不同页面的操作
    const url = window.location.href;
    const path = window.location.pathname.replace(/\/$/, '');
    if (url.search(/https:\/\/www\.1point3acres\.com\/bbs\/((forum|thread|tag|plugin.php\?id=dsu_paulsign:sign).*)?$/) == 0) { // 可签到、答题的页面
        // 自动签到
        const sign = jq('div.flex > a:contains("签到领奖")')[0];
        sign && (sign.target = '_blank') && sign.click(); // 点击签到领奖
        if (url === 'https://www.1point3acres.com/bbs/plugin.php?id=dsu_paulsign:sign&operation=qiandao&infloat=0&inajax=0') { // 签到成功跳转页
            return;
        }
        // 签到后自动答题
        const dayquestion = jq('#ahome_question')[0] ||
            jq('a[href*="/next/daily-question"]')[0] ||
            jq('a:contains("答题")').toArray().find(element => /daily-question|答题中|每日答题/.test(element.href + element.textContent));
        !sign && dayquestion && dayquestion.click();
        // 新特性通知，不干扰签到、答题
        !sign && !dayquestion && (() => {
            const currentVersion = GM_info.script.version;
            // 每个版本只通知一次
            getValue('global', 'lastVersion') !== currentVersion && (setValue('global', 'lastVersion', currentVersion) || 1) &&
                UI.notice.success({
                    title: currentVersion + '更新提示',
                    content: '增强自动答题DOM兼容性',
                    autoClose: 8000
                });
        })();
    }
    if (path === '/next/daily-checkin') {
        const panel = document.querySelector('.grid.grid-cols-5');
        setTimeout(() => {
            panel.querySelector('.grid-cols-5 .rounded-md.border:last-child').click();
            // setInterval(() => panel.querySelector('.text-center > button').click(), 1000);
        }, 1000);
    }
    if (path === '/next/daily-question') { // 自动答题页
        const normalizeText = text => (text || '').replace(/\s+/g, ' ').trim();
        const normalizeQuestion = text => normalizeText(text)
            .replace(/^(\d+\s*[.、．]\s*)?(题目|问题|问)[:：]?\s*/i, '')
            .replace(/^Q[:：]\s*/i, '');
        const normalizeOption = text => normalizeText(text)
            .replace(/^([A-Z]|\d+)\s*[.、．:：]\s*/i, '');
        const normalizeLoose = text => normalizeText(text)
            .replace(/[?？!！,，.。:：;；'"“”‘’\s]/g, '')
            .toLowerCase();
        const unknownQuestionPrompt = question => `尚未收录此题答案。如果您知道答案，请将\n"\n${question}\n{您的答案}\n"\n以issue形式提交至https://github.com/eagleoflqj/p1a3_script/issues`;
        const unmatchedOptionPrompt = (question, answer) => `题库答案未匹配到当前页面选项。题目：\n${question}\n题库答案：\n${answer}`;
        const unique = elements => Array.from(new Set(elements.filter(Boolean)));
        const uniqueOptions = options => options
            .filter((option, index) => options.findIndex(item => item.element === option.element || item.text === option.text) === index);
        const isInvalidOptionText = text => !text ||
            text.includes('搜索全站') ||
            text.includes('提交答案') ||
            text.includes('尚未收录') ||
            text.length > 300;
        const escapeSelector = value => window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"');
        const submitAnswer = () => {
            const submit = [...document.querySelectorAll('button')]
                .find(button => normalizeText(button.innerText).includes('提交答案'));
            submit && submit.click();
        };
        const getInputLabel = input => input.id && document.querySelector(`label[for="${escapeSelector(input.id)}"]`);
        const getOptionElement = element => {
            if (element.matches('input[type="radio"], input[type="checkbox"]')) {
                return getInputLabel(element) || element.closest('label') || element;
            }
            return element.closest('label, button, [role="radio"], [role="checkbox"], [onclick], .cursor-pointer') || element;
        };
        const getOptionText = element => {
            if (element.matches('input[type="radio"], input[type="checkbox"]')) {
                const label = getInputLabel(element) || element.closest('label') || element.parentElement;
                return normalizeOption(label && label.textContent);
            }
            return normalizeOption(element.textContent || element.getAttribute('aria-label') || element.value);
        };
        const isAnswerMatch = (optionText, answerText) => {
            const option = normalizeOption(optionText);
            const answer = normalizeOption(answerText);
            return option === answer || option.includes(answer) || (option.length >= 4 && answer.includes(option));
        };
        const findQuestion = root => {
            const rawText = root.innerText || root.textContent;
            const pageText = normalizeText(rawText);
            const loosePageText = normalizeLoose(pageText);
            const extractedQuestion = normalizeQuestion((rawText.match(/(?:【题目】|题目[:：])\s*([^\n]+)/) || [])[1]);
            const qaCandidates = Object.keys(QA)
                .filter(question => pageText.includes(question) || loosePageText.includes(normalizeLoose(question)))
                .sort((a, b) => b.length - a.length);
            const elementCandidates = unique([
                ...root.querySelectorAll('.text-orange, [class*="text-orange"], h1, h2, h3, p'),
                ...document.querySelectorAll('.text-orange, [class*="text-orange"], h1, h2, h3, p')
            ])
                .map(element => normalizeQuestion(element.textContent))
                .filter(question => question && question.length >= 4 && question.length <= 200);
            const lineCandidates = (root.textContent || '')
                .split('\n')
                .map(normalizeQuestion)
                .filter(question => question && question.length >= 4 && question.length <= 200);
            const candidates = unique([...elementCandidates, ...lineCandidates]);
            const knownCandidates = candidates
                .filter(question => QA[question])
                .sort((a, b) => a.length - b.length);
            return qaCandidates[0] || knownCandidates[0] || extractedQuestion;
        };
        const collectOptions = root => {
            const preferredElements = root.querySelectorAll([
                'div.cursor-pointer.bg-gray-200',
                'div.cursor-pointer[class*="bg-gray"]',
                '[class*="cursor-pointer"][class*="bg-gray"]'
            ].join(','));
            const fallbackElements = root.querySelectorAll([
                '.mt-4 > div',
                '.cursor-pointer',
                '[class*="cursor-pointer"]',
                'label',
                'button',
                '[role="radio"]',
                '[role="checkbox"]',
                'input[type="radio"]',
                'input[type="checkbox"]'
            ].join(','));
            const elements = unique([...preferredElements, ...fallbackElements]);
            return uniqueOptions([...elements]
                .map(element => ({
                    element: getOptionElement(element),
                    text: getOptionText(element)
                }))
                .filter(option => option && !isInvalidOptionText(option.text)));
        };
        const helper = () => {
            const form = document.querySelector('.min-h-\\[40vh\\]') || document.querySelector('form') || document.querySelector('main') || document.body;
            const question = findQuestion(form);
            if (!question) {
                setTimeout(helper, 1000);
                return;
            }
            const answer = QA[question];
            if (!answer) { // 题库不含此题
                console.log(unknownQuestionPrompt(question));
                return;
            }
            // 自动回答
            const answer_list = typeof answer === 'string' ? [answer] : answer;
            const options = collectOptions(form);
            const option_list = answer_list
                .map(answer => options
                    .filter(option => isAnswerMatch(option.text, answer))
                    .sort((a, b) => a.text.length - b.text.length)[0])
                .filter(Boolean)
                .map(option => option.element);
            if (!option_list.length) {
                console.log(unmatchedOptionPrompt(question, answer));
                return;
            }

            option_list.forEach(option => option.click());
            setTimeout(submitAnswer, 300);
            console.log(question + '\n答案为：' + answer);
        };
        helper();
    }
    if (url.search('thread') > 0) { // 详情页
        // 自动查看学校、三维
        const elements = jq('.typeoption a:contains(点击查看)');
        elements.toArray().forEach(element => element.onclick());
    } else if (url.search('forum-82-1') > 0 || url.search('forum.php\\?mod=forumdisplay&fid=82') > 0) { // 结果汇报列表页
        // 按上次的筛选条件过滤录取结果
        const search_ids = ['planyr', 'planterm', 'planmajor', 'plandegree', 'planfin', 'result', 'country']; // 过滤下拉菜单id
        const search_button = jq('#searhsort > div.ptm.cl > button'); // 搜索按钮
        if (GM_getValue('searchoption')) { // 上次过滤了
            search_ids.forEach(id => jq('#' + id).val(GM_getValue(id)));// 自动填充下拉菜单
            if (url.search('filter') < 0) { // 当前页面没有过滤
                search_button.click(); // 自动过滤
                return;
            }
        }
        search_button.click(() => { // 如果不全是默认值，记下当前选项
            search_ids.some(id => jq('#' + id).val() !== '0') && GM_setValue('searchoption', 1);
            GM_getValue('searchoption') && search_ids.forEach(id => GM_setValue(id, jq('#' + id).val()));
        });
        // 添加重置按钮
        const reset_button = jq('<button type="button" class="pn pnc"><em>重置</em></button>');
        reset_button.click(() => { // 重置、清存储
            GM_deleteValue('searchoption');
            search_ids.forEach(id => {
                jq('#' + id).val('0');
                GM_deleteValue(id);
            });
        });
        search_button.after(reset_button);
        // 折叠占空间的提示
        const img = jq('#forum_rules_82_img')[0];
        img && img.src.search('collapsed_no') > 0 && img.onclick();
    }
})();

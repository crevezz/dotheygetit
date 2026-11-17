/* Teacher results wording, and the pupil lines that sit next to it.
   One place, so a wording pass can swap the sentences without hunting.
   British English. No em dashes. No exclamation marks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.COPY = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const verdict = {
    green: 'Gets it',
    amber: 'Partly there, some gaps',
    red: 'Not there yet',
    unclear: "Couldn't tell from this answer"
  };

  /* Fourteen help chapters. 529.8s rounds to 8 minutes 50 seconds.
     The app, the help total, and the "watch the lot" line all use this. */
  const VIDEO_SECONDS = 529.8;

  function words(s) {
    return String(s || '').trim().split(/\s+/).filter(Boolean);
  }
  function limitWords(s, n) {
    const w = words(s);
    return (w.length <= n ? w : w.slice(0, n)).join(' ');
  }
  function formatMinutes(secs) {
    let total = Math.round(Number(secs) || 0);
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    const minWord = m === 1 ? 'minute' : 'minutes';
    const secWord = s === 1 ? 'second' : 'seconds';
    return m + ' ' + minWord + ' ' + s + ' ' + secWord;
  }
  const videoTotal = formatMinutes(VIDEO_SECONDS);

  function verdictLabel(level) {
    const k = String(level || '').toLowerCase();
    return verdict[k] || verdict.unclear;
  }
  function countLine(n, total) {
    return 'Covered ' + n + ' of ' + total + ' key points';
  }
  function missedLine(n) {
    const c = Math.max(0, Number(n) || 0);
    return c + ' ' + (c === 1 ? 'pupil' : 'pupils') + ' missed this';
  }
  function reteachLine(point) {
    return 'Re-teach to the class: ' + String(point || '').trim();
  }
  /* A one-word skill tag ("Explaining") is not a fact to recap on its own. */
  function isSkillTag(skill) {
    return /^[A-Za-z]+ing$/i.test(String(skill || '').trim());
  }
  function nextLine(skill, topic) {
    const raw = String(skill || '').replace(/[\u2014\u2013]/g, ',').trim();
    if (!raw) return '';
    let line;
    if (isSkillTag(raw)) {
      const bit = limitWords(String(topic || 'this').replace(/[\u2014\u2013]/g, ','), 3);
      line = 'Next: recap ' + bit + ', focus on ' + raw.toLowerCase();
    } else {
      line = 'Next: recap ' + limitWords(raw, 7);
    }
    if (words(line).length > 10) line = 'Next: recap ' + limitWords(raw, 7);
    return line.replace(/\s+/g, ' ').trim();
  }
  function tryLine(question) {
    let q = String(question || '').replace(/[\u2014\u2013]/g, ',').replace(/\?+$/, '').trim();
    if (!q) return '';
    q = q.charAt(0).toUpperCase() + q.slice(1);
    return 'Try: ' + q + '?';
  }
  function notesFor(level) {
    if (level === 'green') return 'The answers are there.';
    if (level === 'red') return 'The main idea is missing.';
    if (level === 'unclear') return verdict.unclear;
    return 'Some of it is there.';
  }
  function buttonLabel(level) {
    const k = String(level || '').toLowerCase();
    if (k === 'green') return 'Green';
    if (k === 'amber') return 'Amber';
    if (k === 'red') return 'Red';
    return verdictLabel(k);
  }

  return {
    verdict: verdict,
    verdictLabel: verdictLabel,
    buttonLabel: buttonLabel,
    countLine: countLine,
    missedLine: missedLine,
    reteachLine: reteachLine,
    nextLine: nextLine,
    tryLine: tryLine,
    notesFor: notesFor,
    isSkillTag: isSkillTag,
    limitWords: limitWords,
    formatMinutes: formatMinutes,
    videoSeconds: VIDEO_SECONDS,
    videoTotal: videoTotal,
    videoNote: 'Fourteen short videos, ' + videoTotal + ' for the lot',
    videoTip: 'Fourteen short videos, ' + videoTotal + ' for the lot.',
    watchLot: 'Watch the lot (' + videoTotal + ')',
    watchLotSub: videoTotal + ', with the title cards.',
    helpTotal: 'Fourteen videos, ' + videoTotal + ' in total. Sound on.',
    notice: "These ratings are AI's best guess from each answer. You know your pupils, so change any you disagree with.",
    noticeShort: 'AI ratings are a guide. Your judgement comes first.',
    yourCall: 'Your call',
    changedByYou: 'Changed by you',
    unclear: verdict.unclear,
    noAnswer: 'No answer yet',
    tick: '✓',
    cross: '✗',
    tickLabel: 'Yes',
    crossLabel: 'No',
    statGreen: 'Gets it',
    statAmber: 'Partly there',
    statRed: 'Not there yet',
    statNoReason: 'No reason',
    tipGreen: 'Gets it.',
    tipAmber: 'Partly there, some gaps.',
    tipRed: 'Not there yet.',
    tipNoReason: 'Right answer, but no reason.',
    tipYours: 'Your call.',
    joinHint: "On the list? Pick it. New? Choose Add my name.",
    joinPick: "Choose your name, or add it.",
    addName: 'Add my name',
    pickName: 'Pick your name...',
    legendGot: 'Gets it',
    legendPart: 'Partly there',
    legendNot: 'Not there yet',
    goBack: function (n) { return 'Check these ' + n + ' tomorrow'; },
    deviceNote: 'Point a device camera at the code. It opens the join page with the class already filled in. This never changes, so it stays good all year.',
    helpLaptop: 'Filmed on a laptop. The device set shows the same journey on a small screen.',
    helpDevice: 'Filmed on a small device screen (390×844). Same fourteen chapters, same words.'
  };
});

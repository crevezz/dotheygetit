// Teaching-tip emails. The wording below is the approved copy.
// Do not reword it. Placeholders, filled per person:
//   {{first_name}}       stored first name, or "there"
//   {{subject}}          maths, science, english, history, geography,
//                        or "your subject" when there isn't one
//   {{unsubscribe_url}}  one-click unsubscribe link
//
// Days: 2, 5, 9, 14, then the day-28 entry every 14 days (28, 42, 56, ...).
// The plain-text body is sent as written. HTML shows each URL as itself.

module.exports = [
  {
    day: 2,
    subject: 'A hinge question in 2 minutes',
    preview: 'One question, mid-lesson, and you know whether to move on.',
    body: 'Hi {{first_name}},\n\nQuick one today, because it only takes two minutes of a lesson.\n\nPick one hinge from your {{subject}} misconception bank that matches what you\'re teaching this week. Put it up part-way through, just before the practice task. (If it\'s on the board, cover the shaded teacher box.)\n\nEveryone answers at once: mini whiteboards, "boards down until I count", or fingers for A to D. Add "and five words on why", so a lucky guess doesn\'t look like understanding.\n\nThen look at the pattern. Mostly right? Crack on. A cluster on one wrong letter? The bank already tells you which mistake that is, so reteach that one idea and ask a fresh question.\n\nThere are more worked examples here:\nHinge questions you can use tomorrow: https://dotheygetit.app/hinge-questions\n\nCraig\nGet It?\n\nYou\'re getting this because you downloaded a free resource from Get It?. Unsubscribe: {{unsubscribe_url}}',
    cta_label: 'Hinge questions you can use tomorrow',
    cta_url: 'https://dotheygetit.app/hinge-questions',
  },
  {
    day: 5,
    subject: 'An exit ticket that actually tells you something',
    preview: 'One question at the bell, and three piles to sort it into.',
    body: 'Hi {{first_name}},\n\nMost exit tickets ask for "three things I learnt" or "confidence from one to five". The pupil who\'s lost writes "nothing" or a 4, and you\'re no wiser.\n\nTry this instead. One question, written before the last activity, where you can guess two likely wrong answers in advance. Ask for the first step rather than the final answer, or show them a mistake a real pupil would make and ask what\'s wrong with it.\n\nThen sort the slips into three piles: got it, nearly, and a specific wrong idea. That third pile is tomorrow\'s starter. And put names on them. Anonymous slips tell you the piles exist, not who\'s in them.\n\nThere are ready-made examples for {{subject}} and other subjects here:\nExit ticket ideas that tell you who got it: https://dotheygetit.app/exit-ticket-ideas\n\nCraig\nGet It?\n\nYou\'re getting this because you downloaded a free resource from Get It?. Unsubscribe: {{unsubscribe_url}}',
    cta_label: 'Exit ticket ideas that tell you who got it',
    cta_url: 'https://dotheygetit.app/exit-ticket-ideas',
  },
  {
    day: 9,
    subject: 'Do they actually get it?',
    preview: 'Pupils explain it in their own words. You see who got it, by name.',
    body: 'Hi {{first_name}},\n\nHonest question: when a lesson finishes, do you know who actually got it?\n\nThat\'s why we built Get It?. You type the topic you taught and it writes the questions. You edit or bin any you don\'t like. Pupils join with a class code on any phone, with no account, and answer privately in their own words, typed or spoken. If they waffle, it digs.\n\nIn about two minutes you see green, amber or red across the class, by name, plus what each pupil actually said. No marking.\n\nIt\'s free while we\'re in beta, with no card. Try it on one {{subject}} class. If it doesn\'t tell you something you didn\'t already know, walk away.\nTry Get It? on one class: https://app.dotheygetit.app/\n\nCraig\nGet It?\n\nYou\'re getting this because you downloaded a free resource from Get It?. Unsubscribe: {{unsubscribe_url}}',
    cta_label: 'Try Get It? on one class',
    cta_url: 'https://app.dotheygetit.app/',
  },
  {
    day: 14,
    subject: 'A free pack for new teachers (and their mentors)',
    preview: 'Behaviour scripts, a 4-minute lesson plan, and emails home that don\'t backfire.',
    body: 'Hi {{first_name}},\n\nOne more freebie, and it isn\'t only for new teachers.\n\nThe New Teacher Survival Pack is everything nobody hands you in week one: a first-week checklist, the first five minutes of every lesson, what to actually say when behaviour kicks off, a lesson plan that takes four minutes, marking without drowning, and emails home that don\'t backfire.\n\nIt\'s written for ECTs, NQTs and trainees, but most of us will recognise it. If you mentor anyone, it\'s yours to copy, print and send to your cohort.\n\nYou can read the whole thing on the page, or leave a first name and email to take the PDF.\nGet the New Teacher Survival Pack: https://dotheygetit.app/new-teacher-pack/\n\nCraig\nGet It?\n\nYou\'re getting this because you downloaded a free resource from Get It?. Unsubscribe: {{unsubscribe_url}}',
    cta_label: 'Get the New Teacher Survival Pack',
    cta_url: 'https://dotheygetit.app/new-teacher-pack/',
  },
  {
    day: 28,
    subject: 'Two-minute tip: start with one worked error',
    preview: 'Find the error, fix the line. Harder to copy than a one-word answer.',
    body: 'Hi {{first_name}},\n\nThis fortnight\'s two-minute tip: start tomorrow\'s lesson with one worked error.\n\nPut up a finished answer containing the mistake you saw most last lesson. Use a real one, not an invented one. Ask: "Find the error and fix the line." Notes closed, in silence, no hints from you.\n\nIt checks the method and the misconception at once, and it\'s much harder to copy at a glance than a one-word answer. Your {{subject}} misconception bank is a good source, because every wrong option in it is a mistake pupils genuinely make.\n\nLook at five books you\'ve chosen on purpose. If the same wrong step turns up twice, assume it\'s in the room and deal with it before the new explanation.\n\nMore do-now ideas here:\nRetrieval practice starters: https://dotheygetit.app/retrieval-practice-starters\n\nCraig\nGet It?\n\nYou\'re getting this because you downloaded a free resource from Get It?. Unsubscribe: {{unsubscribe_url}}',
    cta_label: 'Retrieval practice starters',
    cta_url: 'https://dotheygetit.app/retrieval-practice-starters',
  },
];

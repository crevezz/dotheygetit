// Teaching-tip emails. Edit this file when the real copy arrives.
//
// Placeholders, replaced for each person:
//   {{first_name}}       stored first name, or "there"
//   {{subject}}          "GCSE Maths", "GCSE Combined Science", "GCSE English",
//                        "GCSE History", "GCSE Geography", "GCSE" (all five PDFs),
//                        or "your classroom" (New Teacher Survival Pack)
//   {{unsubscribe_url}}  one-click unsubscribe link
//
// The sender also adds a sign-off and an unsubscribe line, so the body does
// not have to include the link.
//
// Schedule: day 2, day 5, day 9, day 14, then every 14 days (28, 42, 56, ...).
// An entry is used on its own day. A later tip with no entry of its own reuses
// these tip entries (day >= 28) in order, starting again at the first.
//
// Everything below is PLACEHOLDER text. Replace it before NURTURE_ENABLED is turned on.

module.exports = [
  {
    day: 2,
    subject: '[PLACEHOLDER] Day 2: {{subject}} for {{first_name}}',
    preview: '[PLACEHOLDER] Preview text for the day 2 email.',
    body: '[PLACEHOLDER] Hi {{first_name}},\n\nThis is the day 2 note about {{subject}}. Replace this copy before the sequence is switched on.\n\nThe PDF is in the first email.',
    cta_label: '[PLACEHOLDER] Open Get It?',
    cta_url: 'https://dotheygetit.app/?utm_source=nurture&utm_medium=email&utm_campaign=day2',
  },
  {
    day: 5,
    subject: '[PLACEHOLDER] Day 5: {{subject}} for {{first_name}}',
    preview: '[PLACEHOLDER] Preview text for the day 5 email.',
    body: '[PLACEHOLDER] Hi {{first_name}},\n\nThis is the day 5 note about {{subject}}. Replace this copy before the sequence is switched on.',
    cta_label: '[PLACEHOLDER] Open Get It?',
    cta_url: 'https://dotheygetit.app/?utm_source=nurture&utm_medium=email&utm_campaign=day5',
  },
  {
    day: 9,
    subject: '[PLACEHOLDER] Day 9: {{subject}} for {{first_name}}',
    preview: '[PLACEHOLDER] Preview text for the day 9 email.',
    body: '[PLACEHOLDER] Hi {{first_name}},\n\nThis is the day 9 note about {{subject}}. Replace this copy before the sequence is switched on.',
    cta_label: '[PLACEHOLDER] Open Get It?',
    cta_url: 'https://dotheygetit.app/?utm_source=nurture&utm_medium=email&utm_campaign=day9',
  },
  {
    day: 14,
    subject: '[PLACEHOLDER] Day 14: {{subject}} for {{first_name}}',
    preview: '[PLACEHOLDER] Preview text for the day 14 email.',
    body: '[PLACEHOLDER] Hi {{first_name}},\n\nThis is the day 14 note about {{subject}}. Replace this copy before the sequence is switched on.',
    cta_label: '[PLACEHOLDER] Open Get It?',
    cta_url: 'https://dotheygetit.app/?utm_source=nurture&utm_medium=email&utm_campaign=day14',
  },
  {
    day: 28,
    subject: '[PLACEHOLDER] Tip: {{subject}} for {{first_name}}',
    preview: '[PLACEHOLDER] Preview text for a fortnightly teaching tip.',
    body: '[PLACEHOLDER] Hi {{first_name}},\n\nThis is the repeating tip about {{subject}}, sent every 14 days after day 14. Replace this copy before the sequence is switched on.\n\nAdd another entry with day 42, 56, and so on, to give a later tip its own words. Until then this one is reused.',
    cta_label: '[PLACEHOLDER] Open Get It?',
    cta_url: 'https://dotheygetit.app/?utm_source=nurture&utm_medium=email&utm_campaign=tip',
  },
];

/* The advert copy. This is the only file you edit to make a new ad.
   a = the plain first line, b = the gradient second line. One idea per ad,
   and each line short enough to hold its own on a phone. */
const ADS = [
  { id: 'thumb',   a: 'The 2-minute',                    b: 'understanding check.' },
  { id: 'hook',    a: 'TEACHERS —',                       b: 'wait.', hook: true },
  { id: 'nodding', a: 'Thirty students nodded.',         b: "Nodding isn't understanding" },
  { id: 'topic',   a: 'Type your lesson topic.',         b: 'Get a check in seconds.' },
  { id: 'minutes', a: 'They answer on phones.',          b: 'You know in 2 minutes.' },
  { id: 'before',  a: "Know who didn't get it",          b: 'before the next lesson.' },
  { id: 'faking',  a: 'Who got it. Who is unsure.',      b: 'Who needs your help.' },
  { id: 'marking', a: 'No marking.',    b: 'Just who understood.' },
  { id: 'sayit',   a: 'Not every pupil writes', b: 'They can just say it' },
];

module.exports = { ADS };

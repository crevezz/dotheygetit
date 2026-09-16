/* Four chapters had more words than film, so the video was being slowed to 0.68-0.88x to let the
 * voice finish - sluggish on screen. Tighter scripts, same voice, natural pace. */
const fs = require('fs');
const P = __dirname + '/narration.json';
const n = JSON.parse(fs.readFileSync(P, 'utf8'));

const NEW = {
  1: `I built this because of the drive home.
You teach the lesson. It feels like it landed. Then three weeks later, something tells you it did not.
Asking them in front of the class does not work. Marking the books does not tell you either - a right answer can be copied.
So Get It asks them properly. One to one, in their own words. And it shows you the gaps while you can still fix them.`,

  7: `The AI reads answers. Sometimes it reads them wrong.
So you can change any colour, by hand.
Say it called a pupil red, and you know she is part way there. Click amber. That is her colour now, and it is the one that counts. The AI's own read stays beside it, so you can see where you disagreed.
Your change is remembered, so it does not flip back next lesson.`,

  8: `Go back to the class.
Every pupil has a line of dots, and every check adds one more.
One red is a bad day. Two of those together is a pattern, and you can see it in about three seconds. Not three weeks later, on the drive home.
Anyone who has finished is greyed out, so you can see who you are still waiting on.
You are not guessing who is struggling any more. You are looking at it, while you can still do something about it.`,

  9: `A word about data, because it matters.
There is a privacy page in plain English. What is kept. Who sees it. What is not done with it. No ads, no tracking, nothing sold.
Your school's policy comes first. If it does not allow pupil answers to go to an outside service, do not use it for that.
You can export a class as a spreadsheet. You can delete a check, with every answer in it. Or delete a class and everything under it.
Last thing. This is a teaching aid, not an assessment. The AI can be wrong. Your judgement is the one that counts.`
};

const out = [];
n.chapters.forEach(c => {
  if (NEW[c.n]) {
    const before = String(c.text).trim().split(/\s+/).length;
    const after = NEW[c.n].trim().split(/\s+/).length;
    c.text = NEW[c.n];
    out.push('ch' + c.n + ': ' + before + ' -> ' + after + ' words');
  }
});
fs.writeFileSync(P, JSON.stringify(n, null, 2) + '\n');
console.log(out.join('\n') || 'nothing changed');

const ww2 = [
  'Examiner: What were the two main alliances fighting in World War 2?',
  'Student: uk and usa',
  'Examiner: The UK and USA were indeed important allies, but can you name the two broad groups of countries that were on opposing sides in the war?',
  'Student: france poland russia italy usa uk',
  'Examiner: Describe one major turning point in World War 2 and explain its significance.',
  'Student: dunkirk, because it was the breaking point into france',
  'Examiner: How did the outcome of World War 2 impact the global political landscape?',
  'Student: it took a lot of fascism out',
  'Examiner: In your own words, explain the primary causes that led to the outbreak of World War 2.',
  'Student: hitler going after jews',
  'Examiner: Analyze how the technological advancements during World War 2 changed the nature of warfare.',
  'Student: dont know'
].join('\n');

const nothing = [
  'Examiner: What is a fraction?',
  'Student: dunno',
  'Examiner: Which is bigger, 1/3 or 1/4?',
  'Student: no idea',
  'Examiner: Can you give an example of two equal fractions?',
  'Student: i cant remember'
].join('\n');

(async () => {
  for (const [name, topic, t] of [['WW2 student', 'WW2', ww2], ['knows nothing', 'fractions', nothing]]) {
    const r = await fetch('http://localhost:4621/api/verdict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, transcript: t })
    });
    const j = (await r.json()).verdict;
    console.log('\n=== ' + name + ' ===');
    console.log('level    :', j.level);
    console.log('gotRight :', JSON.stringify(j.gotRight));
    console.log('gets     :', j.gets);
    console.log('notes    :', j.notes);
    console.log('next     :', j.nextStep);
  }
})();
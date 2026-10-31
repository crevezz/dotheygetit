/* Which mark points belong on the check the teacher is about to publish.
   Points stay with the question text they were written for. A question that
   was pasted over, or added, has no points yet. A question that was removed
   simply is not here, so its points go with it.
   The browser loads this as a plain script. Node tests require() it. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.planCheckMarks = api.planCheckMarks;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clean(list) {
    return (list || []).map(q => String(q || '').trim()).filter(Boolean);
  }

  function planCheckMarks(originalQuestions, originalMarks, finalQuestions) {
    const orig = clean(originalQuestions);
    const finalQs = clean(finalQuestions);
    const marksIn = originalMarks || [];
    const unchanged = orig.length === finalQs.length && orig.every((q, i) => q === finalQs[i]);
    if (unchanged) {
      return {
        questions: finalQs,
        unchanged: true,
        marks: finalQs.map((_, i) => Array.isArray(marksIn[i]) ? marksIn[i].slice() : []),
        missing: []
      };
    }
    const pool = orig.map((q, i) => ({
      q,
      marks: Array.isArray(marksIn[i]) ? marksIn[i].slice() : [],
      used: false
    }));
    const marks = [];
    const missing = [];
    finalQs.forEach((q, i) => {
      const hit = pool.find(p => !p.used && p.q === q);
      if (hit) {
        hit.used = true;
        marks.push(hit.marks);
      } else {
        marks.push(null);
        missing.push({ index: i, question: q });
      }
    });
    return { questions: finalQs, unchanged: false, marks, missing };
  }

  return { planCheckMarks };
});

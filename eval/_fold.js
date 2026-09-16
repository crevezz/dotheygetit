// Let a teacher fold a pupil's card down to just the name and the colour.
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..');

let a = fs.readFileSync(path.join(R, 'public', 'app.js'), 'utf8');
const anchor = `      toast(final ? 'Marked ' + final + ' — overruling the marking' : 'Back to the marking');
    });
  }`;
if (!a.includes(anchor)) { console.error('MISS wire anchor'); process.exit(1); }
const add = `      toast(final ? 'Marked ' + final + ' — overruling the marking' : 'Back to the marking');
    });

    /* Fold a card down to the name and the colour. Thirty finished pupils is thirty long
       cards, and the teacher wants the board - who is red - not the essays. Click the name
       to fold, click again to open. Folded state is held on the element, so the 12-second
       redraw keeps it. */
    document.addEventListener('click', (e) => {
      const head = e.target.closest && e.target.closest('.sresult > .head');
      if (!head || (e.target.closest && e.target.closest('.ovbtn'))) return;
      if (window.getSelection && String(window.getSelection()).length) return;
      head.parentElement.classList.toggle('folded');
      if (!head.parentElement.querySelector('.fnote')) {
        const n = document.createElement('span');
        n.className = 'fnote';
        head.appendChild(n);
      }
      const n = head.querySelector('.fnote');
      const folded = head.parentElement.classList.contains('folded');
      n.textContent = folded ? 'show' : 'hide';
    });
  }`;
a = a.replace(anchor, add);

/* keep the fold across a redraw: the DOM is rebuilt, so remember which names are folded */
const dr = 'function drawResults(s, students) {\n  /* the teacher\'s override.';
if (!a.includes(dr)) { console.error('MISS drawResults'); process.exit(1); }
a = a.replace(dr, `function drawResults(s, students) {
  /* the 12-second redraw rebuilds every card, so the folded ones are remembered by name */
  if (!drawResults.folded) drawResults.folded = new Set();
  if (!drawResults._mark) {
    drawResults._mark = true;
    document.addEventListener('click', (e) => {
      const head = e.target.closest && e.target.closest('.sresult > .head');
      if (head) {
        const name = head.querySelector('.name');
        if (name) {
          const n = name.textContent;
          drawResults.folded.has(n) ? drawResults.folded.delete(n) : drawResults.folded.add(n);
        }
      }
    }, true);
  }
  /* the teacher's override.`);
fs.writeFileSync(path.join(R, 'public', 'app.js'), a);

let c = fs.readFileSync(path.join(R, 'public', 'styles.css'), 'utf8');
if (!c.includes('.sresult.folded')) {
  c += `\r\n/* folded card: just the name and the colour, so the teacher can see the board */\r\n.sresult > .head{ cursor:pointer; user-select:none }\r\n.sresult > .head .fnote{ margin-left:auto; font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); opacity:.75 }\r\n.sresult > .head:hover .fnote{ color:var(--accent); opacity:1 }\r\n.sresult.folded > *:not(.head){ display:none }\r\n`;
  fs.writeFileSync(path.join(R, 'public', 'styles.css'), c);
}
console.log('fold added');

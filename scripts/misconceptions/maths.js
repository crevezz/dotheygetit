/** GCSE Maths misconception bank. Teacher copy. */
module.exports = {
  id: 'maths',
  pdf: 'gcse-maths-misconceptions.pdf',
  name: 'GCSE Maths',
  heading: 'GCSE Maths misconception bank',
  dek: 'Fractions, algebra, graphs, shape, probability, and the formulas that get swapped.',
  items: [
    {
      topic: 'Fractions',
      stem: 'What is 1/2 + 1/3?',
      options: [
        ['2/5', 'The numerators were added, and so were the denominators.'],
        ['5/6', null],
        ['2/6', 'The numerators were added and a denominator was kept.'],
        ['1/6', 'The fractions were multiplied instead of added.']
      ],
      reteach: 'Use a common denominator: 3/6 + 2/6 = 5/6. Adding the bottoms is not how addition works.'
    },
    {
      topic: 'Fractions',
      stem: 'What is 1/2 × 1/3?',
      options: [
        ['1/6', null],
        ['5/6', 'The fractions were added. Multiplying by a fraction less than 1 should get smaller, not bigger.'],
        ['2/5', 'The tops and the bottoms were added.'],
        ['2/3', 'The numerators were added and the 3 was kept.']
      ],
      reteach: 'Multiply the numerators and multiply the denominators. 1/2 of 1/3 is 1/6.'
    },
    {
      topic: 'Fractions',
      stem: 'What is 1/2 ÷ 1/4?',
      options: [
        ['2', null],
        ['1/8', 'The fractions were multiplied.'],
        ['2/4', 'The tops were divided and the bottoms were divided.'],
        ['1/4', 'The divisor was copied as the answer.']
      ],
      reteach: 'Dividing by 1/4 is the same as multiplying by 4. How many quarters are in a half? Two.'
    },
    {
      topic: 'Negative numbers',
      stem: 'What is −3 − (−5)?',
      options: [
        ['2', null],
        ['−8', 'The two negatives were added as if both were debts.'],
        ['−2', '5 was taken from 3 and the minus sign was kept.'],
        ['8', 'The signs were dropped and the numbers added.']
      ],
      reteach: 'Subtracting a negative is the same as adding. −3 + 5 = 2.'
    },
    {
      topic: 'Negative numbers',
      stem: 'What is −4 × −3?',
      options: [
        ['12', null],
        ['−12', 'The sign of the first number was kept. Negative times negative is positive.'],
        ['−7', 'The numbers were added and a minus was attached.'],
        ['1', 'The numbers were subtracted.']
      ],
      reteach: 'Same signs give a positive product. 4 × 3 = 12, and two minuses make a plus.'
    },
    {
      topic: 'Decimals',
      stem: 'What is 0.3 × 0.2?',
      options: [
        ['0.06', null],
        ['0.6', 'Only one decimal place was counted. The question has two.'],
        ['0.5', 'The decimals were added.'],
        ['6', 'The decimal points were ignored.']
      ],
      reteach: '3 × 2 = 6, and there are two digits after the points in the question, so the answer is 0.06.'
    },
    {
      topic: 'Percentages',
      stem: 'What is 20% of £50?',
      options: [
        ['£10', null],
        ['£20', '20% was read as £20.'],
        ['£30', '20 was subtracted from 50.'],
        ['£70', '20 was added to 50.']
      ],
      reteach: '20% is one fifth. £50 ÷ 5 = £10. Percent means out of 100, not “the number of pounds”.'
    },
    {
      topic: 'Percentages',
      stem: 'A price rises by 10%, then falls by 10%. The final price is',
      options: [
        ['lower than the starting price', null],
        ['the same as the starting price', 'The two 10%s were treated as if they cancel.'],
        ['higher than the starting price', 'The rise was treated as the last and larger change.'],
        ['impossible to compare without knowing the starting price', 'The result does not depend on the start. The fall is always the larger pound amount.']
      ],
      reteach: 'The 10% fall is worked out on the higher price, so it removes more than the rise added. £100 becomes £110, then £99.'
    },
    {
      topic: 'Ratio',
      stem: 'Red and blue counters are in the ratio 2:3. What fraction of the counters are red?',
      options: [
        ['2/5', null],
        ['2/3', 'The ratio was read as a fraction. 2:3 compares parts. It is not “2 out of 3”.'],
        ['3/5', 'The blue share was given.'],
        ['1/2', 'The two numbers were treated as equal.']
      ],
      reteach: 'Add the parts first. 2 + 3 = 5, so red is 2 of those 5 parts, which is 2/5.'
    },
    {
      topic: 'Ratio',
      stem: '£60 is shared in the ratio 2:3. The two shares are',
      options: [
        ['£24 and £36', null],
        ['£2 and £3', 'The parts of the ratio were treated as the pounds.'],
        ['£30 and £30', 'The money was halved and the ratio was ignored.'],
        ['£20 and £40', 'The 2 was ignored and the money was split using 3 only.']
      ],
      reteach: '2 + 3 = 5 parts. One part is £60 ÷ 5 = £12. Then 2 × £12 and 3 × £12.'
    },
    {
      topic: 'Indices',
      stem: 'Simplify y³ × y⁴.',
      options: [
        ['y⁷', null],
        ['y¹²', 'The powers were multiplied.'],
        ['y', 'The powers were cancelled.'],
        ['y³⁴', 'The powers were written next to each other.']
      ],
      reteach: 'Same base, and you are multiplying: add the powers. 3 + 4 = 7. Multiply powers only when the power is raised again, as in (y³)⁴.'
    },
    {
      topic: 'Indices',
      stem: 'What is 5⁰?',
      options: [
        ['1', null],
        ['0', 'A power of zero was read as “nothing”.'],
        ['5', 'The power was ignored.'],
        ['50', 'The 0 was written on the end of the 5.']
      ],
      reteach: 'Any non-zero number to the power 0 is 1. It is not 0. 5¹ = 5, and each step down divides by 5, so 5⁰ = 1.'
    },
    {
      topic: 'Standard form',
      stem: 'Which of these is 4500 in standard form?',
      options: [
        ['4.5 × 10³', null],
        ['45 × 10²', 'This equals 4500, but standard form allows only one non-zero digit before the decimal point.'],
        ['0.45 × 10⁴', 'This equals 4500, but the first number has to be at least 1 and less than 10.'],
        ['4.5 × 10⁴', 'The power is one too big. That is 45000.']
      ],
      reteach: 'Standard form is a × 10ⁿ, where a is from 1 up to but not including 10. 4500 = 4.5 × 10³.'
    },
    {
      topic: 'Algebra',
      stem: 'Expand 3(x + 4).',
      options: [
        ['3x + 12', null],
        ['3x + 4', 'Only the first term inside the bracket was multiplied.'],
        ['3x + 7', '3 was added to 4 instead of multiplying.'],
        ['x + 12', 'Only the 4 was multiplied by 3.']
      ],
      reteach: 'The number outside multiplies every term inside. 3 × x and 3 × 4.'
    },
    {
      topic: 'Algebra',
      stem: 'Expand (x + 5)².',
      options: [
        ['x² + 10x + 25', null],
        ['x² + 25', 'Each term was squared and the middle term was dropped.'],
        ['x² + 5x + 25', 'The middle term was not doubled.'],
        ['x² + 10x + 10', '5 was doubled instead of squared.']
      ],
      reteach: '(x + 5)² means (x + 5)(x + 5). The middle term is 2 × x × 5. Square both ends and double the middle.'
    },
    {
      topic: 'Algebra',
      stem: 'Factorise x² + 7x + 12.',
      options: [
        ['(x + 3)(x + 4)', null],
        ['(x + 7)(x + 12)', 'The two numbers already written in the quadratic were put in the brackets.'],
        ['(x + 2)(x + 6)', 'The numbers multiply to 12, but they add to 8, not 7.'],
        ['(x + 1)(x + 12)', 'The numbers multiply to 12, but they add to 13, not 7.']
      ],
      reteach: 'Find two numbers that multiply to 12 and add to 7. That is 3 and 4. Check by expanding.'
    },
    {
      topic: 'Equations',
      stem: 'Solve 2x + 6 = 14.',
      options: [
        ['x = 4', null],
        ['x = 10', '6 was added to 14 instead of subtracted, then the result was halved.'],
        ['x = 8', '6 was subtracted, then the divide by 2 was forgotten. 14 − 6 is not the value of x.'],
        ['x = 7', '14 was divided by 2 and the + 6 was ignored.']
      ],
      reteach: 'Undo the + 6 first: 2x = 8. Then divide by 2. Check: 2 × 4 + 6 = 14.'
    },
    {
      topic: 'Inequalities',
      stem: 'Solve −2x > 8.',
      options: [
        ['x < −4', null],
        ['x > −4', 'Both sides were divided by −2, and the inequality sign was not reversed.'],
        ['x < 4', 'The sign of the 4 was dropped when the inequality was reversed.'],
        ['x > 4', '8 was divided by 2 and both signs were left as they were.']
      ],
      reteach: 'Dividing by a negative reverses the inequality. −2x > 8 becomes x < −4. Check with a number: x = −5 works, x = −3 does not.'
    },
    {
      topic: 'Sequences',
      stem: 'The sequence is 3, 7, 11, 15. What is the nth term?',
      options: [
        ['4n − 1', null],
        ['4n + 3', 'The first term was used as the number you add. For n = 1 that gives 7, not 3.'],
        ['n + 4', 'The difference was added to n. That does not generate the sequence.'],
        ['3n + 4', 'The first term was used as the multiplier.']
      ],
      reteach: 'The difference is 4, so start from 4n. For n = 1 you need 3, and 4 × 1 − 1 = 3. Always test n = 1.'
    },
    {
      topic: 'Graphs',
      stem: 'A line passes through (0, 1) and (2, 5). What is the gradient?',
      options: [
        ['2', null],
        ['5', 'The y-coordinate of the second point was used.'],
        ['4', 'The change in y was found and not divided by the change in x.'],
        ['1/2', 'Run was divided by rise, instead of rise by run.']
      ],
      reteach: 'Gradient is change in y divided by change in x. (5 − 1) / (2 − 0) = 2.'
    },
    {
      topic: 'Graphs',
      stem: 'Where does y = 3x + 2 cross the y-axis?',
      options: [
        ['(0, 2)', null],
        ['(0, 0)', 'The line was assumed to pass through the origin.'],
        ['(2, 0)', '+ 2 was read as the x-intercept.'],
        ['(0, 3)', 'The gradient was used instead of the intercept.']
      ],
      reteach: 'In y = mx + c, c is the y-intercept. When x = 0, y = 2, so the crossing point is (0, 2).'
    },
    {
      topic: 'Area',
      stem: 'A triangle has base 8 cm and perpendicular height 5 cm. What is its area?',
      options: [
        ['20 cm²', null],
        ['40 cm²', 'The half was forgotten. Base × height is the rectangle, not the triangle.'],
        ['13 cm²', 'The base and the height were added.'],
        ['4 cm²', 'The base was halved and the height was ignored.']
      ],
      reteach: 'Area of a triangle is ½ × base × perpendicular height. The height has to be at right angles to the base you used.'
    },
    {
      topic: 'Area and perimeter',
      stem: 'A rectangle is 6 cm by 4 cm. Which pair is right?',
      options: [
        ['Area 24 cm², perimeter 20 cm', null],
        ['Area 20 cm², perimeter 24 cm', 'Area and perimeter were swapped.'],
        ['Area 24 cm², perimeter 10 cm', 'The two sides were added once and the trip around was not finished.'],
        ['Area 10 cm², perimeter 24 cm', 'The sides were added for the area and multiplied for the perimeter.']
      ],
      reteach: 'Area is length × width, in cm². Perimeter is the distance round: 6 + 4 + 6 + 4 = 20 cm.'
    },
    {
      topic: 'Circles',
      stem: 'A circle has radius 3 cm. What is its area?',
      options: [
        ['9π cm²', null],
        ['6π cm²', 'That is the circumference, 2πr, not the area.'],
        ['3π cm²', 'π was multiplied by the radius once.'],
        ['36π cm²', 'The diameter was used in πr².']
      ],
      reteach: 'Area is πr². Circumference is 2πr. 6π is the distance around this circle, not the space inside it.'
    },
    {
      topic: 'Pythagoras',
      stem: 'A right-angled triangle has hypotenuse 10 cm and one shorter side 6 cm. The other shorter side is',
      options: [
        ['8 cm', null],
        ['√136 cm', 'The squares were added, which is what you do when the hypotenuse is the missing side.'],
        ['4 cm', 'The lengths were subtracted.'],
        ['16 cm', 'The lengths were added.']
      ],
      reteach: 'The hypotenuse is the longest side. To find a shorter side, subtract the squares: √(10² − 6²) = 8. Add the squares only when you are finding the hypotenuse.'
    },
    {
      topic: 'Trigonometry',
      stem: 'In a right-angled triangle the opposite is 4 cm and the hypotenuse is 8 cm. 4/8 is',
      options: [
        ['sin of the angle', null],
        ['cos of the angle', 'Opposite over hypotenuse was called cos.'],
        ['tan of the angle', 'Opposite over hypotenuse was called tan. Tan uses the adjacent, not the hypotenuse.'],
        ['impossible to know without the adjacent', 'The adjacent is not needed for this ratio.']
      ],
      reteach: 'SOHCAHTOA: sin = opposite / hypotenuse. Cos uses the adjacent. Tan uses opposite and adjacent, and no hypotenuse.'
    },
    {
      topic: 'Angles',
      stem: 'Two angles sit on a straight line. One is 70°. The other is',
      options: [
        ['110°', null],
        ['290°', '360° was used. That is a full turn, not a straight line.'],
        ['90°', 'The angle was assumed to be a right angle.'],
        ['20°', '70° was subtracted from 90° instead of from 180°.']
      ],
      reteach: 'Angles on a straight line add to 180°, not 360°. 180 − 70 = 110.'
    },
    {
      topic: 'Angles',
      stem: 'What is the sum of the interior angles of a hexagon?',
      options: [
        ['720°', null],
        ['1080°', 'The number of sides was multiplied by 180. The rule is (n − 2) × 180.'],
        ['360°', 'The sum of the exterior angles was used as if it were the interior sum.'],
        ['120°', 'One interior angle of a regular hexagon was given, not the sum.']
      ],
      reteach: 'Interior sum = (n − 2) × 180°. For 6 sides that is 4 × 180 = 720°. 120° is one angle only if the hexagon is regular.'
    },
    {
      topic: 'Probability',
      stem: 'A pupil says the probability of an event is 1.2. What is right?',
      options: [
        ['1.2 cannot be a probability', null],
        ['1.2 means the event is very likely', 'Numbers above 1 were treated as “even more certain”.'],
        ['1.2 means the event is certain', 'Certain is 1. Anything above 1 is off the scale.'],
        ['1.2 means it happens 12 times out of 10, which is allowed', 'A probability cannot be greater than 1.']
      ],
      reteach: 'Probabilities run from 0 to 1 inclusive. 0 is impossible, 1 is certain. 1.2 is not on the scale.'
    },
    {
      topic: 'Probability',
      stem: 'A fair spinner can land only on red or on blue, with equal chance. What is the probability it lands on red or blue?',
      options: [
        ['1', null],
        ['1/4', 'The two probabilities were multiplied. That is a method for “and”, not for this “or”.'],
        ['1/2', 'The probability of one colour was given.'],
        ['0', '“Or” was read as “both at once”, which this spinner cannot do.']
      ],
      reteach: 'Red and blue cover every outcome, so the probability is 1. Multiply for independent events joined by “and”. Add outcomes that do not overlap when the word is “or”.'
    },
    {
      topic: 'Averages',
      stem: 'The numbers are 2, 3 and 7. What is the mean?',
      options: [
        ['4', null],
        ['3', 'The median, the middle value, was given.'],
        ['7', 'The largest value was given.'],
        ['2', 'The first value was given.']
      ],
      reteach: 'The mean is the total divided by how many. (2 + 3 + 7) ÷ 3 = 4. The median of this list is 3. They are not the same.'
    },
    {
      topic: 'Correlation',
      stem: 'Ice-cream sales and cases of sunburn both rise in summer. What is a sound conclusion?',
      options: [
        ['They rise together. That does not mean ice cream causes sunburn.', null],
        ['Ice cream causes sunburn', 'A link was treated as one thing causing the other.'],
        ['Sunburn causes people to buy ice cream', 'The link was turned into a cause, the other way round.'],
        ['There is no link of any kind', 'The pattern was denied because it is not a cause.']
      ],
      reteach: 'The two can rise together because hot weather affects both. Correlation is not the same as one variable causing the other.'
    },
    {
      topic: 'Bounds',
      stem: 'A length is 7 cm, measured to the nearest centimetre. The lower bound is',
      options: [
        ['6.5 cm', null],
        ['6 cm', 'A whole centimetre was taken off.'],
        ['6.9 cm', 'One tenth was taken off, which would suit a measurement to the nearest tenth.'],
        ['7 cm', 'The rounded value was treated as the bound.']
      ],
      reteach: 'To the nearest centimetre, 7 covers from 6.5 cm up to but not including 7.5 cm. The lower bound is 6.5 cm.'
    },
    {
      topic: 'Compound measures',
      stem: 'A car travels 120 miles in 2 hours. What is its average speed?',
      options: [
        ['60 mph', null],
        ['240 mph', 'Distance and time were multiplied.'],
        ['122 mph', 'The numbers were added.'],
        ['118 mph', 'The numbers were subtracted.']
      ],
      reteach: 'Speed = distance ÷ time. 120 ÷ 2 = 60. Units: miles per hour.'
    },
    {
      topic: 'Compound measures',
      stem: 'A block has mass 40 g and volume 8 cm³. What is its density?',
      options: [
        ['5 g/cm³', null],
        ['0.2 g/cm³', 'Volume was divided by mass. Density is mass divided by volume.'],
        ['320 g/cm³', 'Mass and volume were multiplied.'],
        ['48 g/cm³', 'Mass and volume were added.']
      ],
      reteach: 'Density = mass ÷ volume. 40 ÷ 8 = 5 g/cm³. A bigger number means more mass in each cubic centimetre.'
    },
    {
      topic: 'Enlargement',
      stem: 'A shape is enlarged by scale factor 3. What happens to its area?',
      options: [
        ['The area is multiplied by 9', null],
        ['The area is multiplied by 3', 'The length scale factor was used for the area.'],
        ['The area is multiplied by 6', 'The scale factor was doubled.'],
        ['The area stays the same', 'Enlargement was treated as a move, not a change of size.']
      ],
      reteach: 'Area scale factor is the length scale factor squared. 3² = 9. Lengths × 3, area × 9.'
    }
  ]
};

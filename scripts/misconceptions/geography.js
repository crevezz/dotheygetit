/** GCSE Geography misconception bank. Teacher copy. */
module.exports = {
  id: 'geography',
  pdf: 'gcse-geography-misconceptions.pdf',
  name: 'GCSE Geography',
  heading: 'GCSE Geography misconception bank',
  dek: 'Maps, hazards, weather, coasts, rivers, and development. Case studies differ by school: the mistake is the part to keep.',
  items: [
    {
      topic: 'Weather and climate',
      stem: 'Which distinction is right?',
      options: [
        ['Weather is the day-to-day conditions. Climate is the average over many years.', null],
        ['Climate is today’s forecast.', 'A long-term average was confused with the conditions outside now.'],
        ['Weather and climate are the same measurement.', 'The timescale was dropped.'],
        ['Climate only means temperature, and weather only means rain.', 'Each word was reduced to one variable. Both cover temperature, rain, wind and the rest.']
      ],
      reteach: 'Weather is what you get today or this week. Climate is the pattern over many years, often taken as about 30. A hot afternoon does not, on its own, show that the climate has changed.'
    },
    {
      topic: 'Climate',
      stem: 'Why is London milder in winter than Moscow, which is only a little further north?',
      options: [
        ['Latitude is not the only control. The sea and the North Atlantic Drift keep western Europe milder than inland places.', null],
        ['Latitude is the only reason one place is warmer than another in winter.', 'Ocean, wind and distance from the sea were left out.'],
        ['London is mild because it is close to the equator.', 'The UK was moved. It is in the mid-latitudes.'],
        ['Ocean currents never affect temperature on land.', 'A major control on NW Europe was denied.']
      ],
      reteach: 'Latitude matters, and it is not the whole story. Maritime places stay milder in winter than continental interiors. The North Atlantic Drift is part of why NW Europe is milder than inland places at a similar latitude.'
    },
    {
      topic: 'Map skills',
      stem: 'On an OS map, contour lines that are very close together show',
      options: [
        ['a steep slope.', null],
        ['flat ground.', 'Close lines were read as “no change”. Close lines mean the height changes over a short distance.'],
        ['land below sea level.', 'Spacing was confused with the height labels. Read the numbers for the height.'],
        ['that the map is a small-scale atlas.', 'Contour spacing on the ground was confused with the scale of the map.']
      ],
      reteach: 'Each contour is a set height. If the lines are close, that height changes over a short horizontal distance, so the slope is steep. Wide spacing is the gentler slope.'
    },
    {
      topic: 'Map skills',
      stem: 'A four-figure grid reference is given as',
      options: [
        ['the easting first, then the northing.', null],
        ['the northing first, then the easting.', 'The order was swapped. Along the corridor, then up the stairs.'],
        ['the contour height, then the easting.', 'A height was put where a grid number belongs.'],
        ['a southing, then a westing.', 'Both directions were reversed.']
      ],
      reteach: 'Read along the bottom of the map first. That is the easting. Then read up the side. That is the northing. Easting, then northing.'
    },
    {
      topic: 'Map skills',
      stem: 'A map has the scale 1:50 000. On the ground, 1 cm on the map represents',
      options: [
        ['500 m.', null],
        ['50 cm.', 'The 50 in 50 000 was read as 50 cm, and the rest of the number was dropped.'],
        ['50 m.', 'A zero was lost. 50 000 cm is 500 m, not 50 m.'],
        ['5 km.', 'A zero was added. 50 000 cm is 0.5 km, not 5 km.']
      ],
      reteach: '1:50 000 means 1 cm stands for 50 000 cm on the ground. 50 000 cm is 500 m, which is 0.5 km. It is not 50 m and it is not 50 cm.'
    },
    {
      topic: 'Map skills',
      stem: 'Grid north on an OS map and magnetic north on a compass',
      options: [
        ['are not the same direction. The difference is shown on the map and it changes over time.', null],
        ['are always exactly the same, so no adjustment is ever needed.', 'Two different norths were treated as one arrow.'],
        ['mean the compass needle points along the grid lines.', 'Magnetic north was renamed as grid north.'],
        ['cannot differ, because magnetic north does not move.', 'Magnetic north does shift. The map’s north arrow records the difference for a stated date.']
      ],
      reteach: 'The grid is drawn to grid north. A compass points towards magnetic north. Use the difference printed on the map. Do not treat the two arrows as the same.'
    },
    {
      topic: 'Rainfall',
      stem: 'Relief rainfall happens because',
      options: [
        ['air is forced to rise, cools, and water vapour condenses.', null],
        ['air cools as it sinks down the far side of the hill.', 'The lee side was given the cooling. Sinking air warms.'],
        ['air sinks over the mountain and warms, which makes the cloud.', 'Rising and sinking were swapped. Warming air does not form that cloud.'],
        ['the sea breeze stops at the coast, so hills never affect rain.', 'Relief rain was denied. Hills are exactly where it happens.']
      ],
      reteach: 'Rising air cools. If it cools enough, cloud and rain form on the windward side. Air sinking on the far side warms, so that side is drier. That drier side is a rain shadow.'
    },
    {
      topic: 'Rainfall',
      stem: 'Convectional rain is caused by',
      options: [
        ['the ground heating the air, so the air rises.', null],
        ['air being forced to rise over a mountain.', 'That is relief rain, not convectional rain.'],
        ['a warm air mass meeting a cold air mass along a front.', 'That is frontal rain. Keep the three types apart.'],
        ['air sinking and warming over a desert.', 'Sinking air was given the job of making rain. It tends to do the opposite.']
      ],
      reteach: 'Convectional: the surface heats the air and the air rises. Relief: air is pushed up by the land. Frontal: two air masses meet. Do not use the mountain story for all three.'
    },
    {
      topic: 'Tectonics',
      stem: 'The focus and the epicentre of an earthquake are',
      options: [
        ['different. The focus is where it starts inside the Earth. The epicentre is the point on the surface above that.', null],
        ['the same point, and “epicentre” is the point underground.', 'The surface point and the underground point were swapped or merged.'],
        ['both on the surface, and the focus is the town with the worst damage.', 'The focus was moved to the surface and redefined as a damage report.'],
        ['only meaningful at a volcano. Earthquakes do not have an epicentre.', 'Earthquakes were limited to volcanoes. The terms belong to the quake.']
      ],
      reteach: 'The focus (hypocentre) is where the rupture starts, inside the crust. The epicentre is directly above it, on the surface. They are not two words for one place.'
    },
    {
      topic: 'Tectonics',
      stem: 'Where do volcanoes form?',
      options: [
        ['At destructive boundaries, at constructive boundaries, and at some hotspots.', null],
        ['Only at destructive plate boundaries.', 'Constructive-boundary volcanoes, and hotspots such as Hawaii, were left out.'],
        ['Only in the middle of plates, never at a boundary.', 'The plate-boundary pattern was denied. Most are at boundaries.'],
        ['Wherever the weather is hot.', 'Climate was used to explain magma.']
      ],
      reteach: 'Destructive boundaries produce volcanoes, and so do constructive boundaries, where magma rises as plates pull apart. Some, such as Hawaii, sit on hotspots. “Only destructive” is too narrow.'
    },
    {
      topic: 'Tectonics',
      stem: 'Which is right about mountains?',
      options: [
        ['Many ranges are fold mountains, pushed up where plates collide. They are not all volcanoes.', null],
        ['Every mountain is a volcano.', 'Fold mountains were reclassified as volcanoes.'],
        ['Mountains only form where plates move apart.', 'Constructive boundaries were given the fold mountains. The big fold ranges are at collision zones.'],
        ['Fold mountains are piles of cooled lava.', 'The folding of rock was replaced with an eruption story.']
      ],
      reteach: 'Name the type. Fold mountains form as rock is compressed and pushed up, often where plates collide. Volcanic mountains are built from erupted material. A mountain is not automatically a volcano.'
    },
    {
      topic: 'Hazards',
      stem: 'A tsunami is',
      options: [
        ['a series of waves set off by a large displacement of water, often an undersea earthquake.', null],
        ['a tidal wave, caused by the tide.', 'The old nickname was taken literally. A tsunami is not the tide.'],
        ['a storm surge caused by strong wind.', 'A weather hazard was swapped in. Wind can cause a surge. That is not a tsunami.'],
        ['something that can only happen in the Atlantic.', 'A hazard of several oceans was limited to one. The 2004 Indian Ocean tsunami is one counter-example.']
      ],
      reteach: 'A tsunami is displaced water, often from an undersea earthquake, travelling as a series of waves. It is not the tide, and it is not a storm surge. Drop the phrase “tidal wave”.'
    },
    {
      topic: 'Hazards',
      stem: 'On the earthquake magnitude scale, one whole number higher means',
      options: [
        ['about 30 times more energy is released, not double.', null],
        ['twice as much energy is released.', 'A logarithmic scale was treated as a linear one.'],
        ['ten times more energy. The factor of ten is the energy.', 'The factor of about ten is the amplitude of the shaking. The energy factor is much larger, about 30 times.'],
        ['the same energy. The number only describes the damage in one town.', 'Magnitude was confused with an intensity scale such as Mercalli, which describes effects at a place.']
      ],
      reteach: 'The magnitude scale is logarithmic. One whole step up is about 10 times the shaking amplitude and about 30 times the energy, not double. Mercalli describes the effects at a particular place. It is not the same number.'
    },
    {
      topic: 'Atmosphere',
      stem: 'The “ozone hole” and global warming are',
      options: [
        ['different problems. Ozone loss is about ultraviolet. Extra greenhouse gases are about heat.', null],
        ['the same problem. The hole is what is warming the planet.', 'Two late-twentieth-century atmospheric issues were merged.'],
        ['linked because greenhouse gases are what punch the hole.', 'The cause of ozone damage, CFCs, was replaced with greenhouse gases in general.'],
        ['solved together: closing the ozone hole would, on its own, stop climate change.', 'A repair of one problem was treated as the repair of the other.']
      ],
      reteach: 'Ozone high in the atmosphere absorbs ultraviolet. CFCs damaged it. The enhanced greenhouse effect is extra gases trapping outgoing heat. Teach them as two problems with different causes.'
    },
    {
      topic: 'Atmosphere',
      stem: 'Which statement about the greenhouse effect is sound?',
      options: [
        ['The natural greenhouse effect keeps Earth warm enough for life. The problem is the extra greenhouse gases.', null],
        ['The greenhouse effect is always harmful and the Earth would be better with none.', 'The natural effect, which keeps the planet habitable, was condemned along with the enhancement.'],
        ['Greenhouse gases only come from greenhouses.', 'The name was taken literally.'],
        ['The greenhouse effect is another name for the hole in the ozone layer.', 'Two different atmospheric processes were identified.']
      ],
      reteach: 'Without a greenhouse effect the Earth would be far too cold for life as we know it. “Enhanced” means extra greenhouse gases trapping more outgoing energy. Teach natural and enhanced as different claims.'
    },
    {
      topic: 'Climate',
      stem: 'The seasons happen because',
      options: [
        ['the Earth’s axis is tilted, so each hemisphere leans towards or away from the Sun through the year.', null],
        ['summer is when the Earth is closer to the Sun.', 'Distance was used. The Earth is closest to the Sun in early January, during the northern winter.'],
        ['the Sun moves closer to the Earth in June.', 'The Sun was given an orbit it does not have. The tilt is the mechanism you teach.'],
        ['the Moon blocks the Sun for half the year.', 'An eclipse story was used for the seasons.']
      ],
      reteach: 'Seasons come from the tilt, not from distance. The Earth is closest to the Sun in early January, which is winter in the northern hemisphere. That single fact kills the “closer means summer” idea.'
    },
    {
      topic: 'Ecosystems',
      stem: 'Tropical rainforest is cleared. What happens to the nutrients?',
      options: [
        ['Most of the nutrients were in the plants. Heavy rain then washes nutrients out of the soil.', null],
        ['The soil stays rich, because that is where the nutrients were stored.', 'The biomass store was relocated into the soil. These soils are poor once the cycle is broken.'],
        ['The soil is rich because it has been fertilised for centuries.', 'A farming history was invented for undisturbed forest.'],
        ['Clearing the trees has no effect on the soil.', 'The nutrient cycle was treated as irrelevant to the ground.']
      ],
      reteach: 'In tropical rainforest most nutrients are in the living plants, cycling quickly. The soil itself is poor. Once the trees go, heavy rain leaches what is left. Do not tell pupils the bare soil stays fertile.'
    },
    {
      topic: 'Ecosystems',
      stem: 'A hot desert',
      options: [
        ['gets very little rain, but rain does fall, and the nights can be cold.', null],
        ['never receives any rain, and stays hot all night.', '“Hot” and “dry” were both made absolute.'],
        ['is wet all year, and hot all night.', 'The climate was reversed.'],
        ['is cold in the daytime, because desert air contains no energy from the Sun.', 'Clear skies, which allow strong daytime heating, were treated as if they blocked the Sun.']
      ],
      reteach: 'Rain is rare and unreliable, not impossible. Clear skies let heat escape at night, so the temperature can fall sharply. “Always hot, never wet” is too blunt.'
    },
    {
      topic: 'Ecosystems',
      stem: 'Which is a fair statement about carbon stores?',
      options: [
        ['Trees store carbon, and so do soils, oceans and underground fossil stores.', null],
        ['Trees are the only store of carbon on Earth.', 'One important store was treated as the only one.'],
        ['Cutting and burning forest takes carbon out of the atmosphere.', 'The direction of the transfer was reversed. Burning moves carbon into the atmosphere.'],
        ['Fossil fuels are not a carbon store.', 'Coal, oil and gas were left out of the stores. They are carbon, locked underground until they are burned.']
      ],
      reteach: 'Trees matter, and they are not the only store. Clearing and burning forest transfers carbon to the atmosphere. Soils, oceans and fossil stores hold carbon too.'
    },
    {
      topic: 'Rivers',
      stem: 'On a meander,',
      options: [
        ['the outside of the bend is eroded, and material is deposited on the inside.', null],
        ['the inside of the bend is eroded, and material is deposited on the outside.', 'The banks were swapped. The fastest flow is on the outside.'],
        ['both banks are eroded at the same rate, so the bend cannot grow.', 'A difference in speed across the channel was denied.'],
        ['deposition only happens at a waterfall.', 'A landform of the upland river was given all of the deposition.']
      ],
      reteach: 'Water flows faster around the outside, so that bank is eroded. You get a river cliff. It slows on the inside, so material is dropped. That is the slip-off slope.'
    },
    {
      topic: 'Coasts',
      stem: 'Longshore drift is',
      options: [
        ['sand and shingle moved along the beach by waves that arrive at an angle.', null],
        ['the tide going in and out.', 'A wave process was renamed as the tide. They are different.'],
        ['sand moved straight out to sea, and never along the coast.', 'The direction was turned offshore. The transport is along the shore.'],
        ['a current that only flows where there is no wind.', 'The wind that creates the angled waves was removed.']
      ],
      reteach: 'Swash runs up the beach at an angle. Backwash runs straight back down under gravity. The material zigzags along the coast. That is not the tide.'
    },
    {
      topic: 'Coasts',
      stem: 'Constructive waves',
      options: [
        ['build a beach. They have a strong swash and a weak backwash.', null],
        ['destroy beaches, because “constructive” means they are the stronger, more damaging wave.', 'The name was read as “more powerful”, and the job was reversed.'],
        ['have a weak swash and a strong backwash.', 'That is the destructive wave. The two profiles were swapped.'],
        ['do not move beach material at all.', 'The whole mechanism was denied. The swash is what pushes material up.']
      ],
      reteach: 'Constructive waves push material up the beach and do not pull much of it back. Destructive waves have a weak swash and a strong backwash, so they comb the beach down. The names match the effect on the beach.'
    },
    {
      topic: 'Coasts',
      stem: 'A headland is worn back by the sea. Which order is right?',
      options: [
        ['Cave, then arch, then stack, then stump.', null],
        ['Stack, then arch, then cave.', 'The isolated pillar was put before the hole that creates it.'],
        ['Stump, then stack, then arch, then cave.', 'The sequence was reversed, from the end back to the start.'],
        ['Arch, then stump, then cave.', 'The stump was placed before the stack has even collapsed, and the cave was put last.']
      ],
      reteach: 'A crack becomes a cave, the cave wears through into an arch, the roof falls and leaves a stack, and the stack is worn down to a stump. Stack does not come before arch.'
    },
    {
      topic: 'Urban',
      stem: 'In a typical city model, the CBD is',
      options: [
        ['mainly shops and offices. Most people live further out.', null],
        ['the place where most of the city’s residents live.', 'The commercial core was treated as the main housing area.'],
        ['the ring of newer housing at the edge.', 'The suburbs were renamed as the CBD.'],
        ['a zone that only exists in low-income countries.', 'A feature of cities in general was limited to one group of countries.']
      ],
      reteach: 'The central business district is commerce: shops, offices, the highest land values. Housing is a larger share of the inner city and the suburbs. Do not tell pupils that most people live in the CBD.'
    },
    {
      topic: 'Urban',
      stem: 'Brownfield land is',
      options: [
        ['land that has already been built on. Reusing it can limit sprawl, and it can also need clearing.', null],
        ['always the better choice, with no drawback.', 'A trade-off was turned into a rule. Contamination, access and cost can all count against a site.'],
        ['farmland that has never been built on.', 'Brownfield was swapped with greenfield.'],
        ['another name for a green belt.', 'A planning designation was confused with a type of site.']
      ],
      reteach: 'Brownfield reuses land and can take pressure off the countryside. It may be contaminated or awkward to build on. Greenfield is often easier, and it uses land that has not been developed. Name the trade-off.'
    },
    {
      topic: 'Development',
      stem: 'A low-income country (LIC) is a country where',
      options: [
        ['average income is low. That does not mean every person who lives there is poor.', null],
        ['everyone is poor.', 'An average was treated as a description of every household.'],
        ['there are no cities.', 'Urbanisation in LICs was denied. Many have very large cities.'],
        ['people do not do paid work.', 'A lower average income was turned into “no economy”.'],
      ],
      reteach: 'LIC is a category based on average income. Averages hide rich and poor inside the country. Say “average”, and do not write “everyone in an LIC is poor”.'
    },
    {
      topic: 'Development',
      stem: 'GDP per person',
      options: [
        ['is an average of economic output. On its own it is not a measure of quality of life.', null],
        ['tells you how good life is for people in that country.', 'An economic average was used as a welfare score.'],
        ['is the wage every worker is paid.', 'An average of output was turned into a payslip.'],
        ['means every person earns more than every person in a country with a lower figure.', 'The average was treated as a minimum. Overlap between countries is normal.']
      ],
      reteach: 'GDP per person is an economic average. Quality of life also involves health, education and rights. HDI brings some of those in. Do not let GDP stand in for “a good life”.'
    },
    {
      topic: 'Population',
      stem: 'Natural increase is',
      options: [
        ['the birth rate minus the death rate.', null],
        ['another name for the birth rate.', 'Deaths were left out of the growth figure.'],
        ['the number of people moving into the country.', 'Migration was substituted for natural change. Migration is a different term.'],
        ['always high if the birth rate is high, whatever the death rate.', 'A high birth rate with a high death rate can still mean a small natural increase.']
      ],
      reteach: 'Natural increase = birth rate − death rate, usually per thousand people per year. It does not include migration. A high birth rate on its own does not tell you the natural increase.'
    },
    {
      topic: 'Population',
      stem: 'Stage 1 of the demographic transition model',
      options: [
        ['has high birth rates and high death rates. The UK today is not in stage 1.', null],
        ['is where the UK is today, because the population is large.', 'A large population was used as proof of stage 1. The UK has low birth and death rates.'],
        ['has a very low birth rate and a very low death rate.', 'Stage 4, or the argument about a stage 5, was labelled as stage 1.'],
        ['is the stage every country is in at the same time.', 'The model was treated as a calendar. Countries are in different stages.']
      ],
      reteach: 'Stage 1 is high, fluctuating birth and death rates, and slow growth. The UK’s low birth rate and low death rate put it in a later stage. A large population is not the test.'
    },
    {
      topic: 'Economy',
      stem: 'Fair trade and free trade are',
      options: [
        ['different. Fair trade is about price and conditions for producers. Free trade is about fewer tariffs and quotas.', null],
        ['two names for the same policy.', 'A certification scheme was identified with the removal of trade barriers.'],
        ['the same, because both contain the word “trade”.', 'A shared word was treated as a shared meaning.'],
        ['opposites in a simple way: fair trade means goods are given away, and free trade means a guaranteed minimum price.', 'Both definitions were scrambled. Free trade does not guarantee a price. Fair trade is not “free goods”.']
      ],
      reteach: 'Free trade lowers barriers such as tariffs. Fair trade is a deal about the price and the conditions for the producer. A pupil can support one, the other, both or neither. They are not synonyms.'
    },
    {
      topic: 'Food',
      stem: 'Which is a fair comment on “food miles”?',
      options: [
        ['Nearby food can still have a high footprint if it was grown in a heated greenhouse.', null],
        ['Food grown locally always has a lower carbon footprint.', 'Transport was treated as the only energy cost.'],
        ['Only the distance matters. How the food was grown cannot change the answer.', 'The growing method was excluded. Heated glass can outweigh a longer journey.'],
        ['Transport never affects the footprint, so distance is irrelevant.', 'The opposite over-claim. Distance can matter. It is not the only thing that matters.']
      ],
      reteach: 'Distance is one part of the footprint. Out-of-season food grown in a heated greenhouse can use more energy than food grown in season and then transported. Compare the cases. Do not announce that local always wins.'
    },
    {
      topic: 'Resources',
      stem: 'Water scarcity',
      options: [
        ['can be a lack of rain, or a lack of pipes, money and treatment, even where rain falls.', null],
        ['only happens where rainfall is very low.', 'Economic scarcity, where water exists but people cannot get at it safely, was left out.'],
        ['is another word for a flood.', 'Too little usable water was swapped with too much.'],
        ['cannot happen in a rich country.', 'Demand, drought and infrastructure failures in high-income countries were denied.']
      ],
      reteach: 'Physical scarcity is a shortage of water. Economic scarcity is water that people cannot reach or treat, because of money, politics or pipes. Low rainfall is not the only route into a shortage.'
    },
    {
      topic: 'Energy',
      stem: 'A renewable energy source',
      options: [
        ['is replenished, and it can still affect habitats, landscapes or rivers.', null],
        ['has no environmental impact, because it is renewable.', '“Renewable” was read as “harmless”.'],
        ['can only be used once, like coal.', 'Renewable was given the definition of non-renewable.'],
        ['includes coal, oil and gas, because the Earth renews them quickly.', 'Fossil fuels were moved into the renewable list. They are not renewed on a human timescale.']
      ],
      reteach: 'Renewable means the source is replenished: wind, solar, and, with limits, water and biofuel. It does not mean no impact. A dam floods a valley. A wind farm changes a landscape. Say the impact as well as the benefit.'
    },
    {
      topic: 'Flooding',
      stem: 'A river floods. Which explanation is the most complete of these?',
      options: [
        ['Heavy rain is one cause. Steep slopes, saturated ground and bare hillsides or drains can make it worse.', null],
        ['Floods are caused only by heavy rain. The land makes no difference.', 'Infiltration, relief and land use were left out.'],
        ['Rivers only flood at the coast.', 'Coastal flooding and river flooding were merged. A river can flood inland.'],
        ['A river flood is always a dam failure.', 'One possible cause was made the only cause. Most floods are not dam breaks.']
      ],
      reteach: 'Rain matters, and so does what the catchment does with it. Steep ground, already-wet soil, deforested slopes and overwhelmed drains all speed water into the channel. Do not stop at “it rained”.'
    }
  ]
};

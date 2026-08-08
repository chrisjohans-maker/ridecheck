// Food database + matcher (pure).
export const FOOD_DB = [
  // ── Recovery powerhouses ──
  {name:'Chocolate milk',k:['chocolate milk','choc milk'],score:95,when:'post',why:'Ideal 3:1 carb-to-protein ratio. Rehydrates, replenishes glycogen, and repairs muscle in one drink.',nutrients:'Carbs, protein, calcium, electrolytes'},
  {name:'Banana',preTiming:'30-60 min before',k:['banana','bananas'],score:90,when:'pre,during,post',why:'Fast-digesting carbs plus potassium to prevent cramping. The ultimate cycling food.',nutrients:'Carbs, potassium, B6'},
  {name:'Oatmeal',preTiming:'2-3 hrs before',k:['oatmeal','oats','porridge'],score:92,when:'pre',why:'Slow-release carbs give sustained energy. Eat 2-3 hours before riding for best results.',nutrients:'Complex carbs, fiber, iron'},
  {name:'Rice + chicken',k:['rice chicken','chicken rice','chicken and rice'],score:93,when:'post',why:'Clean carbs to refill glycogen plus lean protein for muscle repair. Classic recovery meal.',nutrients:'Carbs, protein, B vitamins'},
  {name:'Eggs',preTiming:'2-3 hrs before',k:['egg','eggs','scrambled','omelette','omelet'],score:88,when:'pre,post',why:'Complete protein with all essential amino acids. Easy to digest. Great with toast pre-ride.',nutrients:'Protein, B12, choline, healthy fats'},
  {name:'Greek yogurt',k:['greek yogurt','yoghurt','yogurt'],score:90,when:'pre,post',why:'High protein, good carbs, and probiotics for gut health. Add honey and fruit for a perfect recovery snack.',nutrients:'Protein, calcium, probiotics'},
  {name:'Peanut butter toast',k:['peanut butter toast','pb toast','toast peanut','toast pb','peanut butter'],score:88,when:'pre,post',why:'Carbs from bread plus healthy fats and protein from PB. Sustained energy pre-ride, satisfying post-ride.',nutrients:'Carbs, healthy fats, protein'},
  {name:'Sweet potato',preTiming:'2-3 hrs before',k:['sweet potato','sweet potatoes','yam'],score:91,when:'pre,post',why:'Complex carbs with a lower glycemic index than white potato. Rich in electrolytes and anti-inflammatory nutrients.',nutrients:'Complex carbs, potassium, vitamin A'},
  {name:'Salmon',k:['salmon','smoked salmon','lox'],score:89,when:'post',why:'Omega-3s reduce inflammation from hard efforts. High quality protein for muscle repair.',nutrients:'Protein, omega-3, vitamin D'},
  {name:'Pasta',preTiming:'3-4 hrs before',k:['pasta','spaghetti','penne','linguine','noodles','mac and cheese','mac & cheese'],score:85,when:'pre,post',why:'Carb-loading staple. Eat the night before or morning of a long ride. Post-ride, add protein.',nutrients:'Carbs, some protein'},
  {name:'Rice',preTiming:'3-4 hrs before',k:['rice','white rice','brown rice','fried rice'],score:84,when:'pre,during,post',why:'Fast-digesting carbs. White rice is easier on the stomach during/after riding than brown.',nutrients:'Carbs, manganese'},
  {name:'Protein shake',k:['protein shake','whey','protein powder','recovery shake'],score:88,when:'post',why:'Fast absorption within the 30-min recovery window. Add a banana for carbs.',nutrients:'Protein, varies by brand'},
  {name:'Smoothie',preTiming:'1-2 hrs before',k:['smoothie','fruit smoothie','berry smoothie','green smoothie'],score:87,when:'pre,post',why:'Easy to digest, hydrating, and you can pack in fruits + protein. Great when solid food feels heavy.',nutrients:'Carbs, vitamins, fiber'},
  
  // ── Good ride foods ──
  {name:'Energy gel',preTiming:'15-30 min before',k:['gel','energy gel','gu','science in sport','sis gel'],score:82,when:'during',why:'Pure fast carbs designed for on-the-bike fueling. Take with water every 30-45 min on rides over 90 min.',nutrients:'Simple carbs, sodium, caffeine (some)'},
  {name:'Energy bar',preTiming:'1-2 hrs before',k:['energy bar','cliff bar','clif bar','kind bar','granola bar'],score:80,when:'pre,during',why:'Portable carbs and calories. Choose higher carb bars for during-ride, higher protein for pre/post.',nutrients:'Carbs, some protein, varies'},
  {name:'Dates',preTiming:'30-60 min before',k:['dates','medjool','medjool dates'],score:88,when:'pre,during',why:'Nature\u0027s energy gel — concentrated fast carbs with potassium and magnesium. 2-3 dates = 1 gel.',nutrients:'Carbs, potassium, magnesium, fiber'},
  {name:'Rice cakes',k:['rice cake','rice cakes','rice bar'],score:83,when:'during',why:'Pro peloton favorite. Easy to make with jam or PB, gentle on the stomach at tempo.',nutrients:'Carbs, low fat'},
  {name:'Trail mix',preTiming:'1-2 hrs before',k:['trail mix','nuts and fruit','mixed nuts fruit'],score:75,when:'pre',why:'Good pre-ride snack. Nuts provide sustained energy. Avoid during hard efforts — fat slows digestion.',nutrients:'Healthy fats, protein, carbs'},
  {name:'Honey',preTiming:'15-30 min before',k:['honey'],score:80,when:'during,post',why:'Fast natural sugar, antibacterial, and easy to add to anything. Mix into water bottles for a natural sports drink.',nutrients:'Simple carbs, antioxidants'},
  
  // ── Common meals ──
  {name:'Burrito',k:['burrito','burrito bowl','chipotle'],score:78,when:'post',why:'Good carb-to-protein ratio with rice and beans. Skip heavy sour cream and excess cheese. Black beans are ideal.',nutrients:'Carbs, protein, fiber'},
  {name:'Chicken sandwich',k:['chicken sandwich','grilled chicken sandwich','chicken wrap'],score:82,when:'post',why:'Lean protein plus carbs from the bread. Grilled beats fried. A solid post-ride option.',nutrients:'Protein, carbs'},
  {name:'Turkey sandwich',k:['turkey sandwich','turkey sub','deli sandwich','sub'],score:80,when:'pre,post',why:'Lean protein, easy to digest. Add avocado for healthy fats. Good 2-3 hours before a ride.',nutrients:'Protein, carbs'},
  {name:'Salad',k:['salad','caesar salad','chicken salad','garden salad'],score:65,when:'pre,post',why:'Healthy but low in carbs and calories. After a hard ride you need to replenish glycogen — add grains, chicken, or dressing.',nutrients:'Vitamins, fiber, low carbs'},
  {name:'Soup',k:['soup','chicken soup','ramen','pho','noodle soup','broth'],score:78,when:'pre,post',why:'Hydrating, easy to digest, and warm. Noodle soups like pho or ramen are great — broth replaces sodium lost in sweat.',nutrients:'Sodium, fluids, varies'},
  {name:'Steak',k:['steak','beef','ribeye','sirloin','filet'],score:72,when:'post',why:'Iron and protein for recovery. But heavy and slow to digest — not ideal immediately post-ride. Better for dinner after a long ride day.',nutrients:'Protein, iron, B12, zinc'},
  {name:'Sushi',k:['sushi','sashimi','sushi roll','poke','poke bowl'],score:82,when:'post',why:'Rice for carbs, fish for protein and omega-3s. A near-perfect post-ride meal. Go easy on the soy sauce (sodium overload).',nutrients:'Carbs, protein, omega-3'},
  {name:'Tacos',k:['taco','tacos','fish tacos','street tacos'],score:76,when:'post',why:'Decent carb-protein balance depending on filling. Fish or chicken tacos beat heavy ground beef. Corn tortillas are lighter.',nutrients:'Carbs, protein, varies'},
  {name:'Pizza',k:['pizza','slice','pizza slice'],score:62,when:'post',why:'High in calories but mostly refined carbs and saturated fat. Occasional post-ride treat is fine, but there are better recovery options.',nutrients:'Carbs, fat, some protein'},
  {name:'Burger',k:['burger','hamburger','cheeseburger'],score:55,when:'post',why:'Heavy, high in saturated fat, slow to digest. The protein helps but the fat slows recovery. An occasional treat, not a recovery strategy.',nutrients:'Protein, fat, carbs'},
  
  // ── Drinks ──
  {name:'Water',k:['water','agua'],score:92,when:'pre,during,post',why:'The foundation of everything. Drink 500ml 2h before riding, sip throughout, rehydrate after. Nothing replaces it.',nutrients:'Hydration'},
  {name:'Electrolyte drink',k:['electrolyte','gatorade','nuun','skratch','liquid iv','sports drink','electrolytes','pedialyte'],score:88,when:'during,post',why:'Replaces sodium, potassium, and magnesium lost in sweat. Essential on hot days or rides over 60 min.',nutrients:'Sodium, potassium, magnesium, carbs'},
  {name:'Coffee',preTiming:'30-60 min before',k:['coffee','espresso','latte','americano','cold brew','cappuccino'],score:78,when:'pre',why:'Caffeine improves power output and reduces perceived effort — proven by research. Drink 30-60 min pre-ride. Avoid post-ride (delays rehydration).',nutrients:'Caffeine, antioxidants'},
  {name:'Beer',k:['beer','ipa','ale','lager','craft beer','pilsner','stout'],score:25,when:'avoid',why:'Alcohol impairs glycogen replenishment, delays muscle repair, and dehydrates you. One beer won\u0027t kill you but it\u0027s the worst recovery drink. Eat first, hydrate, then have one if you want.',nutrients:'Calories, alcohol, minimal nutrition'},
  {name:'Wine',k:['wine','red wine','white wine','rosé'],score:30,when:'avoid',why:'Same alcohol problems as beer. Small antioxidant benefits from red wine don\u0027t outweigh the recovery cost. Hydrate and eat first.',nutrients:'Alcohol, some antioxidants'},
  {name:'Soda',k:['soda','coke','cola','sprite','pepsi','pop'],score:35,when:'avoid',why:'Pure sugar with no nutritional value. The carbonation can cause bloating. If you need quick sugar, a sports drink or real food is better.',nutrients:'Sugar, caffeine (cola)'},
  {name:'Coconut water',k:['coconut water','coconut'],score:82,when:'during,post',why:'Natural electrolytes, especially potassium. Lower sodium than sports drinks so not a complete replacement, but great for rehydration.',nutrients:'Potassium, magnesium, natural sugars'},
  {name:'Orange juice',k:['orange juice','oj','juice','apple juice','fruit juice'],score:72,when:'pre,post',why:'Fast sugar plus vitamin C. Decent post-ride but acidic on an empty stomach. Better blended into a smoothie.',nutrients:'Vitamin C, carbs, potassium'},
  {name:'Milkshake',k:['milkshake','shake','malt'],score:55,when:'post',why:'High in sugar and saturated fat. Has some protein from milk. Chocolate milk is a better choice — same taste, much better recovery profile.',nutrients:'Sugar, fat, some protein'},
  
  // ── Snacks ──
  {name:'Avocado toast',k:['avocado toast','avo toast','avocado'],score:80,when:'pre,post',why:'Healthy fats and carbs. Add an egg for protein and it becomes an excellent pre-ride breakfast or recovery meal.',nutrients:'Healthy fats, fiber, carbs'},
  {name:'Bagel',preTiming:'2-3 hrs before',k:['bagel','bagel cream cheese'],score:78,when:'pre',why:'Dense carbs for pre-ride fueling. Pair with peanut butter or cream cheese. Easy on the stomach 2 hours before.',nutrients:'Carbs, some protein'},
  {name:'Watermelon',k:['watermelon'],score:85,when:'during,post',why:'92% water for rehydration, natural sugars for quick energy, and L-citrulline which may reduce muscle soreness.',nutrients:'Water, carbs, L-citrulline, lycopene'},
  {name:'Berries',k:['berries','blueberries','strawberries','raspberries','blackberries'],score:84,when:'pre,post',why:'Anti-inflammatory antioxidants help recovery. Add to yogurt or oatmeal for a complete recovery snack.',nutrients:'Antioxidants, vitamin C, fiber'},
  {name:'Dark chocolate',k:['dark chocolate','chocolate'],score:70,when:'pre,post',why:'Antioxidants and a small caffeine boost. 70%+ dark chocolate is anti-inflammatory. A square or two is fine — don\u0027t eat the whole bar.',nutrients:'Antioxidants, iron, magnesium'},
  {name:'French fries',k:['fries','french fries','chips','potato chips'],score:40,when:'avoid',why:'Fried = inflammatory. The salt replaces electrolytes but the trans fats slow recovery. Baked potato is the better choice.',nutrients:'Carbs, sodium, fat'},
  {name:'Ice cream',k:['ice cream','gelato','frozen yogurt','froyo'],score:45,when:'avoid',why:'High sugar and fat. Small amount won\u0027t hurt but it\u0027s empty calories when your body needs real nutrients to rebuild.',nutrients:'Sugar, fat, some calcium'},
  {name:'Candy',k:['candy','gummy','skittles','swedish fish','gummy bears','haribo'],score:38,when:'avoid',why:'Pure sugar with zero nutrition. On the bike, gummy bears actually work as fuel. Off the bike, eat real food.',nutrients:'Sugar only'},
  {name:'Donut',k:['donut','doughnut','pastry','croissant','muffin','danish'],score:40,when:'avoid',why:'Refined sugar and fat — the worst combo for recovery. Tastes great, does nothing for your muscles. Save it for a non-ride day.',nutrients:'Sugar, fat, refined carbs'},
  {name:'Pancakes',preTiming:'2-3 hrs before',k:['pancakes','waffles','french toast','crepes'],score:68,when:'pre',why:'Decent pre-ride carb loading if eaten 2-3 hours before. Add berries and skip heavy syrup. Post-ride, there are better options.',nutrients:'Carbs, some protein'},
  {name:'Cereal',preTiming:'2-3 hrs before',k:['cereal','granola','muesli'],score:70,when:'pre',why:'Quick carbs with milk. Choose whole grain over sugary options. With fruit and yogurt it becomes a solid pre-ride meal.',nutrients:'Carbs, varies'},
  {name:'Hummus',k:['hummus','hummus and pita','pita'],score:75,when:'pre,post',why:'Plant protein and complex carbs from chickpeas. Good with pita or veggies. Not enough on its own for recovery — add a protein source.',nutrients:'Plant protein, fiber, healthy fats'},
  {name:'Acai bowl',k:['acai','acai bowl','pitaya','smoothie bowl'],score:78,when:'pre,post',why:'Antioxidant-rich with good carbs from fruit and granola. Watch portion size — some bowls have 80g+ sugar from toppings.',nutrients:'Antioxidants, carbs, fiber'},
  {name:'Nuts',k:['almonds','cashews','walnuts','peanuts','pistachios','nuts'],score:68,when:'pre,during',why:'Healthy fats and some protein but slow to digest. Small handful pre-ride is fine. Not ideal during or immediately after.',nutrients:'Healthy fats, protein, magnesium'},
  // ── Additional foods ──
  {name:'Red Bull',k:['red bull','energy drink','monster','celsius'],score:42,when:'avoid',why:'Caffeine boost but loaded with sugar and artificial ingredients. A coffee or gel is better for sustained cycling energy.',nutrients:'Caffeine, sugar, taurine'},
  {name:'Protein bar',k:['protein bar','quest bar','rxbar','built bar'],score:72,when:'post',why:'Higher protein than energy bars. Better post-ride than during — protein slows digestion when you need fast carbs.',nutrients:'Protein, carbs, fiber'},
  {name:'Rice bowl',k:['rice bowl','poke bowl','grain bowl','chipotle bowl','buddha bowl'],score:84,when:'post',why:'Versatile base with good carbs. Add protein and veggies for a near-perfect recovery meal.',nutrients:'Carbs, varies by toppings'},
  {name:'Chicken breast',k:['chicken breast','grilled chicken','baked chicken'],score:82,when:'post',why:'Lean protein powerhouse for muscle repair. Pair with rice or sweet potato for complete recovery.',nutrients:'Protein, B6, selenium'},
  {name:'Tuna',k:['tuna','tuna sandwich','tuna salad'],score:80,when:'post',why:'High protein, omega-3s, and easy to prepare. Canned tuna on crackers is a quick post-ride option.',nutrients:'Protein, omega-3, vitamin D'},
  {name:'Tofu',k:['tofu','tempeh'],score:74,when:'post',why:'Solid plant protein for recovery. Tempeh has more protein and probiotics. Needs seasoning but nutritionally strong.',nutrients:'Plant protein, iron, calcium'},
  {name:'Tailwind',k:['tailwind','skratch','drink mix','maurten'],score:88,when:'during',why:'Designed specifically for on-bike fueling. Calories + electrolytes in one bottle. Easier on the stomach than gels for long rides.',nutrients:'Carbs, sodium, calories'},
  {name:'Stroopwafel',k:['stroopwafel','wafel','syrup waffle'],score:82,when:'during',why:'Pro peloton favorite. Sticky caramel carbs that taste great mid-ride. Warm one on your top tube for 10 minutes first.',nutrients:'Simple carbs, sugar'},
  {name:'Fig bar',preTiming:'30-60 min before',k:['fig bar','fig newton','fig'],score:78,when:'pre,during',why:'Natural sugars with some fiber. Gentler on the stomach than gels. Good bridge between real food and pure fuel.',nutrients:'Carbs, fiber, potassium'},
  {name:'Pickles',k:['pickle','pickles','pickle juice'],score:72,when:'during,post',why:'Pickle juice stops cramps almost instantly — the vinegar triggers a neural reflex. A secret weapon on hot rides.',nutrients:'Sodium, vinegar, zero calories'},
  {name:'Alcohol-free beer',k:['non-alcoholic beer','na beer','athletic brewing','zero beer'],score:72,when:'post',why:'Surprisingly decent recovery drink. Isotonic, anti-inflammatory polyphenols, no alcohol to impair recovery. The cycling community is embracing it.',nutrients:'Carbs, polyphenols, electrolytes'},
  {name:'Fried chicken',k:['fried chicken','kfc','chicken tenders','chicken nuggets','wings'],score:45,when:'avoid',why:'Deep fried = inflammatory. The protein helps but the oil and breading slow recovery. Grilled chicken is the same protein without the damage.',nutrients:'Protein, fat, sodium'},
  {name:'Ramen noodles',k:['instant ramen','cup noodles','instant noodles'],score:52,when:'post',why:'High sodium replaces what you sweated out, but minimal nutrition otherwise. Add an egg and vegetables to make it a real meal.',nutrients:'Sodium, carbs, minimal protein'},
  {name:'Peanut butter',preTiming:'2-3 hrs before',k:['peanut butter','pb','almond butter','nut butter'],score:76,when:'pre,post',why:'Calorie-dense with healthy fats and protein. Great on toast or banana pre-ride. Too heavy during a ride.',nutrients:'Healthy fats, protein, magnesium'},
  {name:'Cottage cheese',preTiming:'2-3 hrs before',k:['cottage cheese'],score:82,when:'pre,post',why:'Casein protein digests slowly, feeding your muscles for hours. Add fruit for carbs. Underrated recovery food.',nutrients:'Protein (casein), calcium'},
  {name:'Granola',preTiming:'2-3 hrs before',k:['granola','muesli','granola bar'],score:72,when:'pre',why:'Dense carbs and calories. Good 2-3 hours before a ride with yogurt. Some granolas are sugar bombs — check the label.',nutrients:'Carbs, fiber, some protein'},
  {name:'Wrap',preTiming:'2-3 hrs before',k:['wrap','tortilla wrap','chicken wrap','veggie wrap'],score:78,when:'pre,post',why:'Portable and customizable. PB+banana wrap pre-ride, chicken+rice wrap post-ride. The tortilla is easy to digest.',nutrients:'Carbs, varies by filling'},
  {name:'Protein smoothie',preTiming:'2-3 hrs before',k:['protein smoothie'],score:90,when:'post',why:'The best of both worlds — fast-absorbing whey protein plus fruit carbs plus liquid for rehydration. Add a banana and you have the perfect recovery drink.',nutrients:'Protein, carbs, vitamins'},
  {name:'Jerky',k:['jerky','beef jerky','turkey jerky','biltong'],score:58,when:'post',why:'High protein but very low carbs and hard to digest. Not ideal right after a ride when you need glycogen replenishment first.',nutrients:'Protein, sodium'},
  {name:'Gummy bears',k:['gummy bears','gummies','haribo','swedish fish'],score:65,when:'during',why:'Cheap fuel that works. Pro cyclists use them. Easy to chew, fast sugar. Just not as efficient as actual gels.',nutrients:'Simple sugars'},
  {name:'Chocolate chip cookie',k:['cookie','cookies','chocolate chip'],score:55,when:'post',why:'Comfort food but poor recovery profile. High sugar and fat, low protein. One cookie after a hard ride won\u0027t hurt — just don\u0027t make it the whole meal.',nutrients:'Sugar, fat, carbs'},
  {name:'Electrolyte tablets',k:['nuun','electrolyte tablet','salt tab','salt tablet','salt stick'],score:85,when:'during,post',why:'Zero calories, pure electrolyte replacement. Essential on hot days. Drop in your bottle — sodium, potassium, magnesium.',nutrients:'Sodium, potassium, magnesium'},
  {name:'Clif Bloks',k:['clif bloks','shot bloks','chews','energy chews','gummy chews'],score:80,when:'during',why:'Chewable fuel designed for endurance athletes. Easier to manage than gels. Some have caffeine. Take with water.',nutrients:'Simple carbs, sodium, caffeine (some)'},
  {name:'Maple syrup',k:['maple syrup','maple'],score:75,when:'during',why:'Natural fuel that some ultra-endurance cyclists swear by. Mix into bottles or drizzle on rice cakes. Real maple only.',nutrients:'Simple carbs, manganese, zinc'},
];

// Approximate macros per typical serving — guidance-grade, not lab-precise.
// Merged onto FOOD_DB by name so the entries above stay untouched.
const MACROS = {
  'Chocolate milk': { serving: '250 ml', cal: 190, carbs: 26, protein: 8 },
  'Banana': { serving: '1 medium', cal: 105, carbs: 27, protein: 1 },
  'Oatmeal': { serving: '1 cup cooked', cal: 160, carbs: 27, protein: 6 },
  'Rice + chicken': { serving: '1 plate', cal: 480, carbs: 55, protein: 35 },
  'Eggs': { serving: '2 large', cal: 145, carbs: 1, protein: 12 },
  'Greek yogurt': { serving: '170 g', cal: 100, carbs: 6, protein: 17 },
  'Peanut butter toast': { serving: '1 slice + PB', cal: 210, carbs: 20, protein: 8 },
  'Sweet potato': { serving: '1 medium', cal: 115, carbs: 27, protein: 2 },
  'Salmon': { serving: '4 oz', cal: 230, carbs: 0, protein: 25 },
  'Pasta': { serving: '1 cup cooked', cal: 220, carbs: 43, protein: 8 },
  'Rice': { serving: '1 cup cooked', cal: 205, carbs: 45, protein: 4 },
  'Protein shake': { serving: '1 scoop', cal: 130, carbs: 5, protein: 25 },
  'Smoothie': { serving: '350 ml', cal: 250, carbs: 45, protein: 8 },
  'Energy gel': { serving: '1 gel', cal: 100, carbs: 24, protein: 0 },
  'Energy bar': { serving: '1 bar', cal: 240, carbs: 40, protein: 8 },
  'Dates': { serving: '3 medjool', cal: 200, carbs: 54, protein: 2 },
  'Rice cakes': { serving: '2 cakes', cal: 70, carbs: 15, protein: 1 },
  'Trail mix': { serving: '1/4 cup', cal: 175, carbs: 16, protein: 5 },
  'Honey': { serving: '1 tbsp', cal: 64, carbs: 17, protein: 0 },
  'Burrito': { serving: '1 large', cal: 620, carbs: 78, protein: 25 },
  'Chicken sandwich': { serving: '1 sandwich', cal: 400, carbs: 40, protein: 30 },
  'Turkey sandwich': { serving: '1 sandwich', cal: 360, carbs: 42, protein: 24 },
  'Salad': { serving: '1 bowl', cal: 300, carbs: 20, protein: 20 },
  'Soup': { serving: '1 bowl', cal: 180, carbs: 22, protein: 9 },
  'Steak': { serving: '6 oz', cal: 420, carbs: 0, protein: 46 },
  'Sushi': { serving: '6–8 pieces', cal: 350, carbs: 55, protein: 15 },
  'Tacos': { serving: '2 tacos', cal: 340, carbs: 34, protein: 18 },
  'Pizza': { serving: '2 slices', cal: 570, carbs: 68, protein: 24 },
  'Burger': { serving: '1 burger', cal: 550, carbs: 40, protein: 30 },
  'Water': { serving: '500 ml', cal: 0, carbs: 0, protein: 0 },
  'Electrolyte drink': { serving: '500 ml', cal: 80, carbs: 20, protein: 0 },
  'Coffee': { serving: '1 cup black', cal: 5, carbs: 0, protein: 0 },
  'Beer': { serving: '12 oz', cal: 155, carbs: 13, protein: 2 },
  'Wine': { serving: '5 oz', cal: 125, carbs: 4, protein: 0 },
  'Soda': { serving: '12 oz', cal: 140, carbs: 39, protein: 0 },
  'Coconut water': { serving: '330 ml', cal: 60, carbs: 15, protein: 0 },
  'Orange juice': { serving: '250 ml', cal: 110, carbs: 26, protein: 2 },
  'Milkshake': { serving: '350 ml', cal: 530, carbs: 75, protein: 12 },
  'Avocado toast': { serving: '1 slice', cal: 230, carbs: 22, protein: 6 },
  'Bagel': { serving: '1 plain', cal: 270, carbs: 53, protein: 11 },
  'Watermelon': { serving: '1 cup', cal: 46, carbs: 12, protein: 1 },
  'Berries': { serving: '1 cup', cal: 60, carbs: 15, protein: 1 },
  'Dark chocolate': { serving: '30 g', cal: 170, carbs: 13, protein: 2 },
  'French fries': { serving: 'medium', cal: 365, carbs: 48, protein: 4 },
  'Ice cream': { serving: '1/2 cup', cal: 210, carbs: 24, protein: 4 },
  'Candy': { serving: '40 g', cal: 160, carbs: 40, protein: 0 },
  'Donut': { serving: '1 donut', cal: 250, carbs: 31, protein: 3 },
  'Pancakes': { serving: '3 pancakes', cal: 350, carbs: 55, protein: 8 },
  'Cereal': { serving: '1 cup + milk', cal: 250, carbs: 45, protein: 8 },
  'Hummus': { serving: '1/4 cup', cal: 100, carbs: 8, protein: 5 },
  'Acai bowl': { serving: '1 bowl', cal: 400, carbs: 70, protein: 8 },
  'Nuts': { serving: '1 oz', cal: 170, carbs: 6, protein: 6 },
  'Red Bull': { serving: '250 ml', cal: 110, carbs: 28, protein: 0 },
  'Protein bar': { serving: '1 bar', cal: 220, carbs: 24, protein: 20 },
  'Rice bowl': { serving: '1 bowl', cal: 550, carbs: 75, protein: 25 },
  'Chicken breast': { serving: '4 oz', cal: 185, carbs: 0, protein: 35 },
  'Tuna': { serving: '1 can', cal: 120, carbs: 0, protein: 26 },
  'Tofu': { serving: '100 g', cal: 145, carbs: 3, protein: 15 },
  'Tailwind': { serving: '1 scoop', cal: 100, carbs: 25, protein: 0 },
  'Stroopwafel': { serving: '1 waffle', cal: 140, carbs: 21, protein: 2 },
  'Fig bar': { serving: '2 bars', cal: 200, carbs: 40, protein: 2 },
  'Pickles': { serving: '2 spears', cal: 10, carbs: 2, protein: 0 },
  'Alcohol-free beer': { serving: '12 oz', cal: 70, carbs: 15, protein: 1 },
  'Fried chicken': { serving: '3 pieces', cal: 500, carbs: 20, protein: 35 },
  'Ramen noodles': { serving: '1 pack', cal: 380, carbs: 52, protein: 8 },
  'Peanut butter': { serving: '2 tbsp', cal: 190, carbs: 7, protein: 8 },
  'Cottage cheese': { serving: '1/2 cup', cal: 110, carbs: 5, protein: 12 },
  'Granola': { serving: '1/2 cup', cal: 230, carbs: 35, protein: 6 },
  'Wrap': { serving: '1 wrap', cal: 350, carbs: 40, protein: 18 },
  'Protein smoothie': { serving: '400 ml', cal: 300, carbs: 40, protein: 25 },
  'Jerky': { serving: '1 oz', cal: 80, carbs: 3, protein: 13 },
  'Gummy bears': { serving: '40 g', cal: 140, carbs: 32, protein: 3 },
  'Chocolate chip cookie': { serving: '1 large', cal: 220, carbs: 30, protein: 2 },
  'Electrolyte tablets': { serving: '1 tab', cal: 10, carbs: 2, protein: 0 },
  'Clif Bloks': { serving: '3 blocks', cal: 100, carbs: 24, protein: 0 },
  'Maple syrup': { serving: '2 tbsp', cal: 110, carbs: 27, protein: 0 },
};
for (const f of FOOD_DB) {
  const m = MACROS[f.name];
  if (m) Object.assign(f, m);
}

// True if `needle` appears as a whole word/phrase in `hay` (space/edge bounded).
// Whole-word matching avoids substring collisions like "ice" matching "rice".
function matchWord(hay, needle) {
  if (!needle) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${esc}(\\s|$)`).test(hay);
}

export function matchFood(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return null;

  let best = null;
  let bestLen = 0;
  for (const food of FOOD_DB) {
    const cands = [food.name.toLowerCase(), ...food.k];
    for (const c of cands) {
      if (q === c) return food; // exact name/keyword wins outright
      // whole-word containment either direction; prefer the most specific (longest) match
      if (matchWord(q, c) || matchWord(c, q)) {
        const len = Math.min(q.length, c.length);
        if (len > bestLen) { best = food; bestLen = len; }
      }
    }
  }
  return best;
}

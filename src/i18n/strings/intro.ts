/**
 * Introdução: os sóis 1 a 3 são um treino guiado (docs/game-design.md, "Introdução: sóis 1 a 3").
 * Linguagem para 7–12 anos (docs/linguagem-e-ui-criancas.md): título com ícone, até 12 palavras por frase.
 * Fatos: F6 (aviso da Terra), F28 (o abrigo ganha massa; máquinas cavam o regolito com energia), F27 (poeira dura semanas ou meses), atraso de 3 a 22 min (JPL Horizons).
 * O que muda na Lua: src/i18n/moon.ts.
 */
export const pt = {
  'intro.badge': '🎓 Treino · sol {sol} de 3',
  'intro.next': 'Próximo',
  'intro.done': 'Entendi',
  'intro.skip': 'Pular o treino',
  'intro.day': '☀️ Dia de treino: os painéis fazem energia com a luz do Sol.',

  'intro.1.base.title': '🏠 Esta é a sua base',
  'intro.1.base.text': 'Ela fica na cratera Jezero, em Marte. A tripulação mora lá dentro.',
  'intro.1.inside.title': '👁️ Veja por dentro',
  'intro.1.inside.text': 'As cápsulas são fechadas, como as de verdade. O botão 👁️ mostra os quartos, a academia e a estufa.',
  'intro.1.day.title': '☀️ De dia, energia do Sol',
  'intro.1.day.text': 'Os painéis fazem energia com a luz do Sol. Divida os blocos no plano, lá embaixo.',
  'intro.1.night.title': '🌙 À noite, a bateria',
  'intro.1.night.text': 'Sem Sol, os painéis param. A base gasta a energia guardada na bateria.',

  'intro.2.earth.title': '📡 Mensagem da Terra!',
  'intro.2.earth.text': 'A antena recebe mensagens da Terra. Esta levou {min} minutos para chegar!',
  'intro.2.far.title': '🌍 A Terra está longe',
  'intro.2.far.text': 'Uma resposta demora muito. Por isso, a tripulação muitas vezes decide sozinha.',
  'intro.2.battery.title': '🔋 Guarde para a noite',
  'intro.2.battery.text': 'O que sobra do dia vai para a bateria. Esta noite, a base gasta {cost}.',

  'intro.3.dust.title': '🌪️ Treino: tempestade de poeira',
  'intro.3.dust.text': 'Em Marte, uma tempestade de poeira pode durar semanas ou meses. Menos Sol, menos energia.',
  'intro.3.solar.title': '☀️ Treino: tempestade solar',
  'intro.3.solar.text': 'A Terra avisa antes da tempestade. Use energia nas máquinas que enchem mais sacos de terra no abrigo!',
  'intro.3.end.title': '✅ Fim do treino',
  'intro.3.end.text': 'Foi só um treino: nada mudou na base. A partir do sol 4, é para valer!',

  'top.hull.open': 'Ver por dentro',
  'top.hull.close': 'Ver por fora',
} as const;

export const en: Record<keyof typeof pt, string> = {
  'intro.badge': '🎓 Training · sol {sol} of 3',
  'intro.next': 'Next',
  'intro.done': 'Got it',
  'intro.skip': 'Skip training',
  'intro.day': '☀️ Training day: the panels make energy from sunlight.',

  'intro.1.base.title': '🏠 This is your base',
  'intro.1.base.text': 'It is in Jezero Crater, on Mars. The crew lives inside.',
  'intro.1.inside.title': '👁️ Look inside',
  'intro.1.inside.text': 'The capsules are closed, like the real ones. The 👁️ button shows the bedrooms, gym and greenhouse.',
  'intro.1.day.title': '☀️ By day, energy from the Sun',
  'intro.1.day.text': 'The panels make energy from sunlight. Split the blocks in the plan, down below.',
  'intro.1.night.title': '🌙 At night, the battery',
  'intro.1.night.text': 'With no Sun, the panels stop. The base uses the energy stored in the battery.',

  'intro.2.earth.title': '📡 Message from Earth!',
  'intro.2.earth.text': 'The antenna gets messages from Earth. This one took {min} minutes to arrive!',
  'intro.2.far.title': '🌍 Earth is far away',
  'intro.2.far.text': 'An answer takes a long time. So the crew often decides alone.',
  'intro.2.battery.title': '🔋 Save some for the night',
  'intro.2.battery.text': 'What is left from the day goes to the battery. Tonight, the base uses {cost}.',

  'intro.3.dust.title': '🌪️ Training: dust storm',
  'intro.3.dust.text': 'On Mars, a dust storm can last weeks or months. Less Sun means less energy.',
  'intro.3.solar.title': '☀️ Training: solar storm',
  'intro.3.solar.text': 'Earth warns you before the storm. Use energy so machines fill more soil bags for the shelter!',
  'intro.3.end.title': '✅ Training is over',
  'intro.3.end.text': 'It was only training: nothing changed in the base. From sol 4 on, it is for real!',

  'top.hull.open': 'See inside',
  'top.hull.close': 'See outside',
};

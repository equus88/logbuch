// Planes de fábrica (versión 1). Se cargan solo si el área aún no tiene planes.
// Las versiones siguientes llegan como archivos que importas en Datos.

const B = (min, n, que) => ({ min, n, que });

const EN = {
  area: 'en',
  version: 1,
  desde: '2026-11-09',
  titulo: 'Semana de retorno · repaso de las semanas 1–3',
  resumen: 'El último registro es del 30 de septiembre. Antes de la semana 4 (past perfect) se repasan los tres primeros temas y se evalúa el jueves.',
  cambios: ['Primera versión en Logbuch, tomada del Plan de Estudio de Inglés.'],
  metaSemanal: { sesiones: 4, minutos: 180 },
  progresion: 'Un tema se da por superado con 80 % o más en corrección y sin el error en la producción libre. Por debajo de 60 %, el tema se repite en la sesión siguiente. Cada error nuevo va al registro de errores.',
  semana: {
    1: {
      titulo: 'Modal único y orden de palabras',
      minutos: 45,
      bloques: [
        B(15, 'Gramática', 'Relee la regla del modal único (sección 9 del plan). Corrige sin mirar: It will may crash · I\'ll going to talk · We must to deliver · Andrea might to talk · We\'ll able to deploy it · never I finished the degree · Could you tell me where is the server? · How many sites you built this year?'),
        B(10, 'Vocabulario', 'Monta en Anki los 10 phrasal verbs de reuniones. Frente: frase en español con el hueco. Reverso: phrasal verb + preposición + ejemplo. Haz la primera pasada completa.'),
        B(10, 'Escucha', 'BBC 6 Minute English: un episodio, primero sin transcripción y luego con ella. Anota 3 expresiones nuevas.'),
        B(10, 'Producción', 'Escribe 5 frases sobre tu semana combinando un modal con una perífrasis: might be able to, will have to, may need to.'),
      ],
      evaluacion: { n: 'Corrección de las 8 frases', total: 8 },
      minimo: '15 min: las 8 frases de corrección y la primera pasada de Anki.',
    },
    2: {
      titulo: 'Past simple vs present perfect',
      minutos: 45,
      bloques: [
        B(15, 'Gramática', 'Regla: momento terminado (yesterday, ago, in 2019) → past simple; experiencia hasta hoy o resultado actual (already, yet, ever, never) → present perfect. Corrige: I\'ve finished the report yesterday · I have been studied English 7 years ago · I send the invoice already · I\'ve never been in UK yet · Rosita come up with a new process. Luego escribe 5 frases propias eligiendo el tiempo.'),
        B(10, 'Vocabulario', 'Repaso de Anki. Agrega 12 tarjetas con make / do / take (sección 10 del plan).'),
        B(10, 'Escucha', 'BBC 6 Minute English: anota cada present perfect que oigas y por qué se usa.'),
        B(10, 'Producción', 'Monólogo de 3 min con el dictado en English (UK): "What have you done since September?" Guarda el texto sin corregir.'),
      ],
      evaluacion: { n: 'Corrección + elección de tiempo', total: 10 },
      minimo: '15 min: las 5 frases de corrección y el repaso de Anki.',
    },
    3: {
      titulo: 'Present perfect continuous, for / since y verbos estativos',
      minutos: 45,
      bloques: [
        B(15, 'Gramática', 'for + duración, since + punto de inicio (nunca since… ago). El continuous es para actividad en curso; con verbos estativos (know, have, like, believe) va el simple. Corrige: She is knowing the client for years · I am working on this bug since 9am · since 10 years ago · are you waiting to long.'),
        B(10, 'Vocabulario', 'Repaso de Anki (phrasal verbs y make / do / take).'),
        B(10, 'Escucha y pronunciación', 'Rutina TH de 2 min (I think this is the third thing) y un episodio de BBC 6 Minute English.'),
        B(10, 'Producción', 'Escribe 5 frases sobre cuánto tiempo llevas haciendo algo: 3 con for y 2 con since, al menos 2 en continuous.'),
      ],
      evaluacion: { n: 'Corrección de las 4 frases + 5 propias', total: 9 },
      minimo: '15 min: las 4 frases de corrección y el repaso de Anki.',
    },
    4: {
      titulo: 'Evaluación de retorno',
      minutos: 45,
      bloques: [
        B(15, 'Retrieval', 'Sin notas: escribe de memoria los 10 phrasal verbs de reuniones, cada uno con su significado y una frase.'),
        B(10, 'Reglas', 'Explica con tus palabras las reglas de las semanas 1–3: modal único, past simple vs present perfect, for / since.'),
        B(10, 'Registro de errores', 'Corrige 10 frases del registro de errores sin mirar la columna correcta.'),
        B(10, 'Producción', 'Un párrafo de 6 a 8 frases que empiece con "Since September…" y use los tres temas.'),
      ],
      evaluacion: { n: 'Retrieval: 10 phrasal verbs + 10 errores', total: 20 },
      minimo: '15 min: solo el retrieval de phrasal verbs.',
      nota: 'Con 14/20 o más, la próxima semana empieza la semana 4 (past perfect y narración). Si no, otra semana de consolidación.',
    },
    0: {
      titulo: 'Repaso del registro de errores (opcional)',
      opcional: true,
      minutos: 15,
      bloques: [B(15, 'Registro de errores', 'Lee el registro completo y marca los 5 errores que más se te repiten. Es opcional: si no lo haces, no cuenta como fallo.')],
    },
  },
};

const DE = {
  area: 'de',
  version: 1,
  desde: '2026-11-09',
  titulo: 'Semana de consolidación · antes de la Lektion 4',
  resumen: 'Retoma el bloque de consolidación que quedó pendiente el 30 de septiembre: conjugación bajo carga, género y expresiones fijas. El jueves, Übung 8 decide si entra la Lektion 4.',
  cambios: ['Primera versión en Logbuch, tomada del Plan de estudio de alemán. Sesión ajustada a 45 min para el contenedor del Fahrplan.'],
  metaSemanal: { sesiones: 4, minutos: 180 },
  progresion: 'La Lektion 4 (nominativo y acusativo) entra cuando la conjugación salga sin fallos bajo carga (8/10 o más en Übung 8). Los errores recurrentes que vuelvan a aparecer se anotan en cada sesión.',
  semana: {
    1: {
      titulo: 'Konsolidierung 1 · Conjugación en presente',
      minutos: 45,
      bloques: [
        B(5, 'Fonética', 'Rutina: tsa-tse-tsi-tso-tsu, scha-sche-schi-scho-schu, escalera i → ü → u y e → ö → o, pares mínimos.'),
        B(10, 'Anki', 'Monta el mazo: sein y haben completos y 10 sustantivos frecuentes con artículo y plural (der Tisch, die Tische).'),
        B(15, 'Lección', 'Drill oral con cronómetro: las 6 formas de sein, haben, machen, arbeiten y wohnen, cada verbo en menos de 15 s. Repasa la e de apoyo: solo si la raíz termina en -t o -d.'),
        B(5, 'Escucha', 'Nicos Weg: el episodio donde ibas, o el 1 si no lo recuerdas.'),
        B(10, 'Producción', '5 frases que empiecen con Heute o Morgen: verbo en segunda posición y sujeto siempre explícito.'),
      ],
      evaluacion: { n: 'Frases sin error de conjugación', total: 5 },
      minimo: '15 min: fonética y Anki.',
    },
    2: {
      titulo: 'Konsolidierung 2 · Género y artículos',
      minutos: 45,
      bloques: [
        B(5, 'Fonética', 'Los cuatro sonidos difíciles: Zeit, Schule, schön, oder (la -er final suena "a").'),
        B(10, 'Anki', 'Repaso y 10 sustantivos más con artículo y plural (van 20).'),
        B(15, 'Lección', 'Género por terminación (Lektion 3): -ung, -heit, -keit, -ion → die; -chen, -lein → das. Übung: pon el artículo a 10 sustantivos aplicando la tabla.'),
        B(5, 'Escucha', 'Nicos Weg, siguiente episodio.'),
        B(10, 'Producción', '5 frases con ein / eine y el verbo conjugado. Revisa el verbo antes de dar la frase por terminada.'),
      ],
      evaluacion: { n: 'Artículos correctos', total: 10 },
      minimo: '15 min: fonética y Anki.',
    },
    3: {
      titulo: 'Konsolidierung 3 · Preguntas y expresiones fijas',
      minutos: 45,
      bloques: [
        B(5, 'Fonética', 'Rutina completa y palabras con "a" final: Vater, Mutter, oder, aber, Kinder.'),
        B(10, 'Anki', '10 sustantivos más (van 30) y tarjetas de bloque: zu Hause, nach Hause, Guten Morgen.'),
        B(15, 'Lección', 'Preguntas W (Woher, Wo, Wie, Was, Wann) con el verbo en segunda posición. Las expresiones fijas se memorizan como bloque, no se analizan.'),
        B(5, 'Escucha', 'Nicos Weg, siguiente episodio.'),
        B(10, 'Producción', '5 preguntas sobre ti y sus respuestas.'),
      ],
      evaluacion: { n: 'Preguntas y respuestas correctas', total: 10 },
      minimo: '15 min: fonética y Anki.',
    },
    4: {
      titulo: 'Übung 8 · Evaluación de consolidación',
      minutos: 45,
      bloques: [
        B(5, 'Fonética', 'Rutina completa.'),
        B(10, 'Anki', 'Repaso de las 30 tarjetas.'),
        B(20, 'Übung 8', 'Sin notas: 10 frases que combinen verbo conjugado, artículo correcto y orden de la frase.'),
        B(10, 'Producción', 'Describe tu día en 6 frases.'),
      ],
      evaluacion: { n: 'Übung 8', total: 10 },
      minimo: '15 min: Übung 8 con solo 5 frases.',
      nota: 'Con 8/10 o más y la conjugación sin fallos, la próxima semana entra la Lektion 4 (nominativo y acusativo).',
    },
    0: {
      titulo: 'Input ligero (opcional)',
      opcional: true,
      minutos: 15,
      bloques: [B(15, 'Input', 'Un video o una canción en alemán. Nada de ejercicios: no cuenta como fallo si no lo haces.')],
    },
  },
};

// El plan de entrenamiento se agrega cuando esté la rutina del proyecto Cuerpo
const CUERPO = null;

export const SEEDS = [EN, DE, CUERPO];

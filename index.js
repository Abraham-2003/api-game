const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// Configuración de Firebase Admin con credenciales desde variable de entorno
if (!process.env.FIREBASE_CONFIG_BASE64) {
  throw new Error("La variable de entorno FIREBASE_CONFIG_BASE64 no está definida.");
}

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_CONFIG_BASE64, "base64").toString()
);
console.log("FIREBASE_CONFIG_BASE64:", process.env.FIREBASE_CONFIG_BASE64 ? "✅ Variable encontrada" : "❌ Variable NO encontrada");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/loginJugador", async (req, res) => {
  const { correo, contraseña } = req.body;
  

  if (!correo || !contraseña)
    return res.status(400).json({ error: "Correo y contraseña requeridos" });

  try {
    const snapshot = await db.collection("jugadores").where("correo", "==", correo).get();
    if (snapshot.empty) {
      console.log("❌ Usuario no encontrado en Firestore");
      return res.status(404).json({ error: "Usuario no registrado" });
    }

    const jugador = snapshot.docs[0].data();
    const jugadorId = snapshot.docs[0].id; 


    if (jugador.contraseña !== contraseña) {
      console.log("⚠️ Contraseña incorrecta");
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }
    res.json({
      uid: jugadorId,
      nombre: jugador.nombre,
      correo: jugador.correo,
      sede: jugador.sede,
      juegos: jugador.juegos || {},
    });
  } catch (error) {
    console.error("🔥 Error al iniciar sesión:", error.message);
    res.status(500).json({ error: "Error interno al iniciar sesión" });
  }
});
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "abrahamren03@gmail.com",
    pass: "didvsjkuutnzvqad"  
  }
});

function generarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post("/enviarCodigoRecuperacion", async (req, res) => {
  const { correo } = req.body;

  try {
    const codigo = generarCodigo();

    const snapshot = await db.collection("jugadores").where("correo", "==", correo).get();
    if (snapshot.empty) return res.status(404).json({ error: "Correo no registrado" });

    const docId = snapshot.docs[0].id;
    await db.collection("jugadores").doc(docId).update({
      codigoRecuperacion: codigo,
      codigoGenerado: admin.firestore.FieldValue.serverTimestamp()
    });

    await transporter.sendMail({
      from: '"Minijuego Soporte" <abrahamren03@gmail.com>',
      to: correo,
      subject: "Código de recuperación",
      html: `<p>Tu código para recuperar tu cuenta es:</p><h2>${codigo}</h2><p>Expira en unos minutos.</p>`
    });

    res.json({ mensaje: "Código enviado al correo" });
  } catch (error) {
    console.error("🔥 Error:", error.message);
    res.status(500).json({ error: "No se pudo enviar el código" });
  }
});
app.post("/verificarCodigo", async (req, res) => {
  const { correo, codigoIngresado, nuevaContraseña } = req.body;

  try {
    const snapshot = await db.collection("jugadores").where("correo", "==", correo).get();
    if (snapshot.empty) return res.status(404).json({ error: "Usuario no encontrado" });

    const jugador = snapshot.docs[0];
    const datos = jugador.data();

    if (datos.codigoRecuperacion !== codigoIngresado) {
      return res.status(401).json({ error: "Código incorrecto" });
    }

    await db.collection("jugadores").doc(jugador.id).update({
      contraseña: nuevaContraseña,
      codigoRecuperacion: null,
      codigoGenerado: null
    });

    res.json({ mensaje: "Contraseña actualizada correctamente" });
  } catch (error) {
    console.error("🔥 Error:", error.message);
    res.status(500).json({ error: "No se pudo verificar o actualizar" });
  }
});


app.post("/registrarJugador", async (req, res) => {
  const { nombre, correo, contraseña, confirmarContraseña, sede } = req.body;

  console.log("📦 Datos recibidos:", { nombre, correo, contraseña, confirmarContraseña, sede });

  if (!nombre || !correo || !contraseña || !confirmarContraseña || !sede)
    return res.status(400).json({ error: "Todos los campos son requeridos" });

  if (contraseña !== confirmarContraseña)
    return res.status(400).json({ error: "Las contraseñas no coinciden" });

  try {
    const existingUser = await admin.auth().getUserByEmail(correo).catch(() => null);
    if (existingUser) {
      return res.status(400).json({ error: "El correo ya está registrado en Auth" });
    }

    const userRecord = await admin.auth().createUser({
      email: correo,
      password: contraseña,
      displayName: nombre,
    });

    console.log("✅ Usuario creado en Auth:", userRecord.uid);

    await db.collection("jugadores").doc(userRecord.uid).set({
      nombre,
      correo,
      contraseña,
      sede,
      creado: admin.firestore.FieldValue.serverTimestamp(),
      juegos: {
        juego1: null,
        juego2: null,
        juego3: null,
        juego4: null
      }
    });

    console.log("✅ Usuario guardado en Firestore con contraseña");

    res.json({ mensaje: "Jugador registrado correctamente y contraseña guardada en Firestore" });
  } catch (error) {
    console.error("🔥 Error en registro:", error.message);
    res.status(500).json({ error: error.message });
  }
});


app.post("/guardarJuego", async (req, res) => {
  const { uid, juegoId, puntaje, tiempo } = req.body;

  if (!uid || !juegoId || typeof puntaje !== "number" || typeof tiempo !== "number")
    return res.status(400).json({ error: "Datos inválidos" });

  const jugadorRef = db.collection("jugadores").doc(uid);
  const jugadorDoc = await jugadorRef.get();

  if (!jugadorDoc.exists)
    return res.status(404).json({ error: "Jugador no encontrado" });

  const jugadorData = jugadorDoc.data();

  if (jugadorData.juegos && jugadorData.juegos[juegoId]) {
    return res.status(400).json({ error: "Ya registró este juego" });
  }

  await jugadorRef.update({
    [`juegos.${juegoId}`]: { puntaje, tiempo }
  });

  res.json({ mensaje: "Resultado del juego guardado" });
});


app.get("/rankingGeneral", async (req, res) => {
  const snapshot = await db.collection("jugadores").get();
  const jugadores = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    let totalPuntos = 0;
    let totalTiempo = 0;
    if (data.juegos) {
      Object.values(data.juegos).forEach(j => {
        if (j) {
          totalPuntos += j.puntaje;
          totalTiempo += j.tiempo;
        }
      });
    }
    jugadores.push({
      nombre: data.nombre,
      sede: data.sede,
      totalPuntos,
      totalTiempo,
    });
  });

  // 👇 Ordenar por puntos descendente, luego tiempo ascendente
  jugadores.sort((a, b) => {
    if (b.totalPuntos !== a.totalPuntos) {
      return b.totalPuntos - a.totalPuntos;
    }
    return a.totalTiempo - b.totalTiempo;
  });

  res.json(jugadores.slice(0, 50));
});

app.get("/rankingSede/:sede", async (req, res) => {
  const { sede } = req.params;
  const snapshot = await db.collection("jugadores").where("sede", "==", sede).get();
  const jugadores = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    let totalPuntos = 0;
    let totalTiempo = 0;
    if (data.juegos) {
      Object.values(data.juegos).forEach(j => {
        if (j) {
          totalPuntos += j.puntaje;
          totalTiempo += j.tiempo;
        }
      });
    }
    jugadores.push({ nombre: data.nombre, totalPuntos, totalTiempo });
  });

  // 👇 Misma lógica de ordenamiento
  jugadores.sort((a, b) => {
    if (b.totalPuntos !== a.totalPuntos) {
      return b.totalPuntos - a.totalPuntos;
    }
    return a.totalTiempo - b.totalTiempo;
  });

  res.json(jugadores.slice(0, 50));
});

app.get("/sedes", async (req, res) => {
  try {
    const snapshot = await db.collection("sedes").get();
    const sedes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(sedes);
  } catch (error) {
    console.error("Error al obtener sedes:", error);
    res.status(500).json({ error: "Error al obtener sedes" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
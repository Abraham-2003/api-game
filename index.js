const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// Configuración de Firebase Admin con credenciales desde variable de entorno
const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_CONFIG_BASE64, "base64").toString());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// Ruta para registrar jugador
app.post("/registrarJugador", async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "Nombre requerido" });

  const snapshot = await db.collection("jugadores").where("nombre", "==", nombre).get();
  if (!snapshot.empty) return res.status(400).json({ error: "Jugador ya existe" });

  await db.collection("jugadores").add({
    nombre,
    puntos: 0,
    creado: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ mensaje: "Jugador registrado" });
});

// Ruta para guardar puntaje
app.post("/guardarPuntaje", async (req, res) => {
  const { nombre, puntos } = req.body;
  if (!nombre || typeof puntos !== "number")
    return res.status(400).json({ error: "Datos inválidos" });

  const snapshot = await db.collection("jugadores").where("nombre", "==", nombre).get();
  if (snapshot.empty) return res.status(404).json({ error: "Jugador no encontrado" });

  const jugadorRef = snapshot.docs[0].ref;
  const jugadorData = snapshot.docs[0].data();

  if (puntos > jugadorData.puntos) {
    await jugadorRef.update({ puntos });
  }

  res.json({ mensaje: "Puntaje actualizado" });
});

// Ruta para obtener top 10
app.get("/top", async (req, res) => {
  const snapshot = await db.collection("jugadores").orderBy("puntos", "desc").limit(10).get();
  const resultados = snapshot.docs.map(doc => doc.data());
  res.json(resultados);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = "mysecretkey";

// ================= FILE DATABASE =================
const USERS_FILE = path.join(__dirname, "users.json");
const APPOINTMENTS_FILE = path.join(__dirname, "appointments.json");
const MEDICINE_FILE = path.join(__dirname, "medicines.json");

// ================= LOAD/SAVE =================
function loadFile(file) {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file));
}

function saveFile(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ================= DATABASE =================
let users = loadFile(USERS_FILE);
let appointments = loadFile(APPOINTMENTS_FILE);
let medicines = loadFile(MEDICINE_FILE);

// ================= CLEAN OLD APPOINTMENTS =================
function cleanOldAppointments() {
    const today = new Date().toISOString().split("T")[0];
    appointments = appointments.filter(a => a.date >= today);
    saveFile(APPOINTMENTS_FILE, appointments);
}
cleanOldAppointments();

// ================= AUTH =================
function verifyToken(req, res, next) {
    const token = req.headers["authorization"];
    if (!token) return res.json({ error: "No token" });

    try {
        req.user = jwt.verify(token, SECRET_KEY);
        next();
    } catch {
        res.json({ error: "Invalid token" });
    }
}

// ================= HOME =================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ================= AUTH =================
app.post("/register", async(req, res) => {
    const { email, password } = req.body;

    if (!email || !password) return res.json({ error: "All fields required" });

    users = loadFile(USERS_FILE);

    if (users.find(u => u.email === email)) {
        return res.json({ error: "User exists" });
    }

    const hash = await bcrypt.hash(password, 10);

    users.push({ id: Date.now().toString(), email, password: hash });
    saveFile(USERS_FILE, users);

    res.json({ success: true });
});

app.post("/login", async(req, res) => {
    const { email, password } = req.body;

    users = loadFile(USERS_FILE);
    const user = users.find(u => u.email === email);

    if (!user) return res.json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.json({ error: "Wrong password" });

    const token = jwt.sign({ email }, SECRET_KEY, { expiresIn: "1h" });

    res.json({ success: true, token });
});

// ================= APPOINTMENTS =================

// BOOK
app.post("/appointments/book", (req, res) => {

    const { patient, age, disease, doctor, date } = req.body;

    if (!patient || !age || !disease || !doctor || !date) {
        return res.json({ error: "All fields required" });
    }

    const slots = [
        "10:00 AM", "10:30 AM", "11:00 AM",
        "11:30 AM", "12:00 PM", "12:30 PM"
    ];

    const doctorAppointments = appointments.filter(a =>
        a.doctor.toLowerCase().trim() === doctor.toLowerCase().trim() &&
        a.date === date
    );

    const booked = doctorAppointments.map(a => a.time);

    const available = slots.find(s => !booked.includes(s));

    if (!available) return res.json({ error: "No slots available" });

    const newApp = {
        _id: Date.now().toString(),
        patient,
        age,
        disease,
        doctor,
        date,
        time: available,
        status: "Pending"
    };

    appointments.push(newApp);
    saveFile(APPOINTMENTS_FILE, appointments);

    res.json(newApp);
});

// ADMIN (ONLY FUTURE)
app.get("/appointments", verifyToken, (req, res) => {
    const today = new Date().toISOString().split("T")[0];
    res.json(appointments.filter(a => a.date >= today));
});

// DOCTOR (ONLY FUTURE)
app.get("/appointments/doctor/:doctor", (req, res) => {

    const doctor = decodeURIComponent(req.params.doctor);
    const today = new Date().toISOString().split("T")[0];

    const result = appointments.filter(a =>
        a.doctor.toLowerCase().trim() === doctor.toLowerCase().trim() &&
        a.date >= today
    );

    res.json(result);
});

// PATIENT (ONLY FUTURE)
app.get("/appointments/patient/:patient", (req, res) => {

    const patient = decodeURIComponent(req.params.patient);
    const today = new Date().toISOString().split("T")[0];

    const result = appointments.filter(a =>
        a.patient.toLowerCase().trim() === patient.toLowerCase().trim() &&
        a.date >= today
    );

    res.json(result);
});

// CONFIRM
app.put("/appointments/confirm/:id", (req, res) => {

    const appo = appointments.find(a => a._id === req.params.id);

    if (!appo) return res.json({ error: "Not found" });

    appo.status = "Confirmed";
    saveFile(APPOINTMENTS_FILE, appointments);

    res.json({ success: true });
});

// ================= INVENTORY =================

// GET
app.get("/inventory", verifyToken, (req, res) => {
    res.json(medicines);
});

// ADD
app.post("/inventory/add", verifyToken, (req, res) => {

    const { name, stock, minStock, expiry, price, controlled } = req.body;

    const med = {
        id: Date.now().toString(),
        name,
        stock: Number(stock),
        minStock: Number(minStock),
        expiry,
        price: Number(price),
        controlled: controlled === true || controlled === "true"
    };

    medicines.push(med);
    saveFile(MEDICINE_FILE, medicines);

    res.json(med);
});

// UPDATE
app.put("/inventory/update/:id", (req, res) => {

    const med = medicines.find(m => m.id === req.params.id);

    if (!med) return res.json({ error: "Not found" });

    med.stock = Number(req.body.stock);
    saveFile(MEDICINE_FILE, medicines);

    res.json({ success: true });
});

// ================= BILLING =================
app.post("/billing", verifyToken, (req, res) => {

    let { items } = req.body;

    // ✅ 1. VALIDATION
    if (!items || !Array.isArray(items)) {
        return res.json({ error: "Invalid items" });
    }

    // ✅ 2. CLEAN INPUT
    items = items
        .map(i => String(i).trim().toLowerCase())
        .filter(i => i !== "");

    let total = 0;
    let notFound = [];
    let outOfStock = [];

    // ✅ 3. PROCESS
    items.forEach(name => {

        const med = medicines.find(m =>
            m.name.toLowerCase().trim() === name.toLowerCase().trim()
        );

        if (!med) {
            notFound.push(name);
        } else if (med.stock <= 0) {
            outOfStock.push(name);
        } else {
            total += med.price;
            med.stock -= 1;
        }
    });

    saveFile(MEDICINE_FILE, medicines);

    // ✅ 4. RESPONSE
    if (total === 0 && notFound.length > 0 && outOfStock.length === 0) {
        return res.json({
            error: "All medicines not found",
            notFound
        });
    }

    if (total === 0 && outOfStock.length > 0 && notFound.length === 0) {
        return res.json({
            error: "All medicines out of stock",
            outOfStock
        });
    }

    // ✅ Mixed or successful case
    res.json({
        total,
        notFound,
        outOfStock,
        message: "Billing completed"
    });
});

// ================= STATIC =================
app.use(express.static(path.join(__dirname, "../frontend")));

// ================= SERVER =================
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
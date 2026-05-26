const express = require('express');
const router = express.Router();

router.post('/add', (req, res) => {
    const { name, age, disease, phone } = req.body;


    console.log(`Adding patient: ${name}`);


    res.status(201).json({
        message: "Patient added successfully!",
        patient: { name, age, disease, phone }
    });
});

module.exports = router;
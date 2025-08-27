// server/routes/contactRoutes.js
const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Test route first
router.get('/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Contact routes are working',
        timestamp: new Date().toISOString()
    });
});

// Public route - Create contact (no authentication required)
router.post('/', contactController.createContact);

// Admin routes - require authentication and admin role
router.get('/', authenticateToken, requireAdmin, contactController.getAllContacts);
router.get('/stats', authenticateToken, requireAdmin, contactController.getContactStats);
router.get('/:id', authenticateToken, requireAdmin, contactController.getContact);
router.put('/:id/status', authenticateToken, requireAdmin, contactController.updateContactStatus);
router.delete('/:id', authenticateToken, requireAdmin, contactController.deleteContact);

module.exports = router;
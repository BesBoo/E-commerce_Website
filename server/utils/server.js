// server.js - DEBUG VERSION with better error handling
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files 
const CLIENT_DIR = path.join(__dirname, '../../client'); 

console.log(' CLIENT_DIR =', CLIENT_DIR);
console.log(' Image directory =', path.join(CLIENT_DIR, 'image'));

app.use('/images', express.static(path.join(CLIENT_DIR, 'image')));
app.use('/css', express.static(path.join(CLIENT_DIR, 'css')));
app.use('/js', express.static(path.join(CLIENT_DIR, 'js')));
app.use(express.static(CLIENT_DIR));

// Debug route to check image files
app.get('/debug/images', (req, res) => {
    const fs = require('fs');
    const imagePath = path.join(CLIENT_DIR, 'image');
    
    try {
        const files = fs.readdirSync(imagePath);
        res.json({
            imagePath,
            files,
            exists: fs.existsSync(imagePath)
        });
    } catch (error) {
        res.json({
            imagePath,
            error: error.message,
            exists: false
        });
    }
});

// Import database modules with error handling
let connectDB, closeDB;

try {
    const dbModule = require('../config/db');
    connectDB = dbModule.connectDB;
    closeDB = dbModule.closeDB;
    console.log('✅ Database module loaded successfully');
} catch (error) {
    console.error(' Database module error:', error.message);
    console.error(' Stack trace:', error.stack);
}

// Function to safely load and validate routes
const loadRoute = (routePath, routeName) => {
    try {
        const routeModule = require(routePath);
        
        // Validate that the module exports a router
        if (!routeModule || typeof routeModule !== 'function') {
            console.error(` ${routeName}: Not a valid Express router`);
            
            // Create fallback router
            const express = require('express');
            const fallbackRouter = express.Router();
            fallbackRouter.get('/test', (req, res) => {
                res.json({ 
                    error: `${routeName} not loaded properly`,
                    timestamp: new Date().toISOString()
                });
            });
            return fallbackRouter;
        }
        
        console.log(` ${routeName} loaded successfully`);
        return routeModule;
        
    } catch (error) {
        console.error(` ${routeName} error:`, error.message);
        console.error(` ${routeName} stack:`, error.stack);
        
        // Create fallback router
        const express = require('express');
        const fallbackRouter = express.Router();
        fallbackRouter.get('/test', (req, res) => {
            res.json({ 
                error: `${routeName} failed to load: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        });
        return fallbackRouter;
    }
};

// Load all routes with error handling
console.log('\n=== Loading Routes ===');
const userRoutes = loadRoute('../routes/userRouters', 'userRouters');
const productRoutes = loadRoute('../routes/productRoutes', 'productRoutes');
const orderRoutes = loadRoute('../routes/orderRouters', 'orderRouters');
const cartRoutes = loadRoute('../routes/cartRoutes', 'cartRoutes');
const promotionRoutes = loadRoute('../routes/promotionRoutes', 'promotionRoutes');
const otherRoutes = loadRoute('../routes/otherRoutes', 'otherRoutes');
const contactRoutes = loadRoute('../routes/contactRoutes', 'contactRoutes');

// Validate routes before using them
const validateAndUseRoute = (app, path, router, routeName) => {
    try {
        if (!router || typeof router !== 'function') {
            throw new Error(`${routeName} is not a valid router function`);
        }
        
        // Test that the router has routes
        const routerStack = router.stack;
        if (routerStack && routerStack.length === 0) {
            console.warn(`⚠️  ${routeName} has no routes defined`);
        }
        
        app.use(path, router);
        console.log(`✅ Route mounted: ${path} -> ${routeName}`);
        
    } catch (error) {
        console.error(`❌ Failed to mount ${routeName} at ${path}:`, error.message);
        
        // Create emergency fallback
        app.get(`${path}/test`, (req, res) => {
            res.json({ 
                error: `${routeName} mount failed`,
                message: error.message,
                timestamp: new Date().toISOString()
            });
        });
    }
};

// Mount API Routes with validation
console.log('\n=== Mounting Routes ===');
validateAndUseRoute(app, '/api/users', userRoutes, 'userRoutes');
validateAndUseRoute(app, '/api/products', productRoutes, 'productRoutes');
validateAndUseRoute(app, '/api/orders', orderRoutes, 'orderRoutes');
validateAndUseRoute(app, '/api/cart', cartRoutes, 'cartRoutes');
validateAndUseRoute(app, '/api/promotions', promotionRoutes, 'promotionRoutes');
validateAndUseRoute(app, '/api', otherRoutes, 'otherRoutes');
validateAndUseRoute(app, '/api/contact', contactRoutes, 'contactRoutes');

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'E-commerce API is running',
        timestamp: new Date().toISOString(),
        routes: {
            users: 'mounted',
            products: 'mounted',
            orders: 'mounted',
            cart: 'mounted',
            promotions: 'mounted',
            other: 'mounted',
            contact: 'mounted'
        }
    });
});

// Debug route to check all mounted routes
app.get('/debug/routes', (req, res) => {
    const routes = [];
    
    const extractRoutes = (stack, prefix = '') => {
        stack.forEach(layer => {
            if (layer.route) {
                // Regular route
                const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
                routes.push({
                    path: prefix + layer.route.path,
                    methods: methods,
                    name: layer.route.path
                });
            } else if (layer.name === 'router' && layer.handle.stack) {
                // Router middleware
                const routerPrefix = layer.regexp.source
                    .replace('^\\', '')
                    .replace('\\/?(?=\\/|$)', '')
                    .replace(/\\\//g, '/');
                extractRoutes(layer.handle.stack, routerPrefix);
            }
        });
    };
    
    extractRoutes(app._router.stack);
    
    res.json({
        success: true,
        totalRoutes: routes.length,
        routes: routes
    });
});

// Serve frontend pages
const pages = ['index', 'cart', 'checkout', 'login', 'register', 'profile', 'admin', 'product','contact'];

pages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        res.sendFile(path.join(CLIENT_DIR, `${page}.html`));
    });
    app.get(`/${page}.html`, (req, res) => res.redirect(`/${page}`));
});

// Product detail page
app.get('/product/:id', (req, res) => {
    res.sendFile(path.join(CLIENT_DIR, 'product.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});

// 404 handler 
app.use((req, res) => {
    if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({ 
            message: 'API endpoint not found',
            path: req.originalUrl,
            method: req.method,
            timestamp: new Date().toISOString()
        });
    } else {
        const notFoundPath = path.join(CLIENT_DIR, '404.html');
        const fs = require('fs');
        
        if (fs.existsSync(notFoundPath)) {
            res.status(404).sendFile(notFoundPath);
        } else {
            res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>404 - Page Not Found</title>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        h1 { color: #e74c3c; }
                        a { color: #3498db; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <h1>404 - Page Not Found</h1>
                    <p>The page you are looking for could not be found.</p>
                    <a href="/">← Back to Home</a>
                </body>
                </html>
            `);
        }
    }
});

// Graceful shutdown
if (closeDB) {
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully');
        await closeDB();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully');
        await closeDB();
        process.exit(0);
    });
}

// Start server
const startServer = async () => {
    try {
        if (connectDB) {
            await connectDB();
        }
        
        app.listen(PORT, () => {
            console.log('\n' + '='.repeat(60));
            console.log(`  Server running on http://localhost:${PORT}`);
            console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`  Database: ${connectDB ? 'Connected to SQL Server' : 'Database connection not available'}`);
            console.log(`  Health check: http://localhost:${PORT}/api/health`);
            console.log(`  Debug routes: http://localhost:${PORT}/debug/routes`);
            console.log('='.repeat(60));
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        console.error('❌ Error stack:', error.stack);
        process.exit(1);
    }
};

startServer();

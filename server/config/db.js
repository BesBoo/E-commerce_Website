// server/config/db.js
const sql = require('mssql/msnodesqlv8');
const util = require('util');
require('dotenv').config();


const config = {
    server: 'your_server_name', 
    database: 'your_database_name',
    driver: 'msnodesqlv8',
    options: {
        trustedConnection: true,
        encrypt: false,
        enableArithAbort: true
    },
    connectionString:
      "Driver={ODBC Driver 17 for SQL Server};Server=Your_server_name;Database=your_database_name;Trusted_Connection=Yes;"
};




// Normalize server and instance for msnodesqlv8
if (config.server && config.server.includes('\\')) {
    const [host, instance] = config.server.split('\\');
    config.server = host || 'localhost';
    config.options.instanceName = instance;
}

// If user/password provided, use SQL Authentication
if (process.env.DB_USER && process.env.DB_PASSWORD) {
    config.user = process.env.DB_USER;
    config.password = process.env.DB_PASSWORD;
    config.options.trustedConnection = false;
}

let pool;

// Helper function to extract meaningful error information
const extractErrorInfo = (err) => {
    const errorInfo = {
        message: 'Unknown error',
        code: err?.code,
        number: err?.number,
        state: err?.state,
        class: err?.class,
        serverName: err?.serverName,
        procName: err?.procName,
        lineNumber: err?.lineNumber
    };

    // Try different ways to get the error message
    if (typeof err?.message === 'string') {
        errorInfo.message = err.message;
    } else if (err?.originalError?.message) {
        errorInfo.message = err.originalError.message;
    } else if (err?.toString && typeof err.toString === 'function') {
        errorInfo.message = err.toString();
    } else {
        errorInfo.message = util.inspect(err, { depth: 2 });
    }

    return errorInfo;
};

// Alternative connection configurations for fallback
const getAlternativeConfigs = () => {
    const baseConfig = { ...config };
    
    return [
        // Config 1: ODBC Driver 18 with HOST\INSTANCE
        {
            ...baseConfig,
            server: 'Your_server_name',
            options: {
                ...baseConfig.options,
                driver: 'ODBC Driver 18 for SQL Server',
                trustedConnection: true
            }
        },
        // Config 2: ODBC Driver 17 with HOST\INSTANCE  
        {
            ...baseConfig,
            server: 'Your_server_name',
            options: {
                ...baseConfig.options,
                driver: 'ODBC Driver 17 for SQL Server',
                trustedConnection: true
            }
        },
        // Config 3: Named Pipe with ODBC Driver 18
        {
            ...baseConfig,
            server: '\\\\.\\pipe\\MSSQL$SQLEXPRESS\\sql\\query',
            options: {
                ...baseConfig.options,
                driver: 'ODBC Driver 18 for SQL Server',
                trustedConnection: true
            }
        },
        // Config 4: Named Pipe with ODBC Driver 17
        {
            ...baseConfig,
            server: '\\\\.\\pipe\\MSSQL$SQLEXPRESS\\sql\\query',
            options: {
                ...baseConfig.options,
                driver: 'ODBC Driver 17 for SQL Server',
                trustedConnection: true
            }
        },
        // Config 5: TCP/IP with port
        {
            ...baseConfig,
            server: 'Your_server',
            port: 1433,
            options: {
                ...baseConfig.options,
                instanceName: 'Your_instance', 
                trustedConnection: true
            }
        }
    ];
};

const connectDB = async () => {
    try {
        if (!pool) {
            pool = await sql.connect(config);
            console.log("✅ Database connected to", config.database);
        }
        return pool;
    } catch (error) {
        console.error("❌ Database connection error:", error);
        throw error;
    }
};


const getPool = () => {
    if (!pool) {
        throw new Error('Database not connected. Call connectDB() first.');
    }
    return pool;
};

const closeDB = async () => {
    try {
        if (pool) {
            await pool.close();
            console.log("🔌 Database connection closed");
            pool = null;
        }
    } catch (error) {
        console.error("❌ Error closing database connection:", error);
    }
};

const testConnection = async () => {
    try {
        console.log('Testing database connection...');
        const testPool = await sql.connect(config);
        const result = await testPool.request().query('SELECT @@VERSION as version, @@SERVERNAME as serverName, DB_NAME() as currentDB');
        
        console.log('✅ Connection test successful');
        console.log('SQL Server Version:', result.recordset[0].version);
        console.log('Server Name:', result.recordset[0].serverName);
        console.log('Current Database:', result.recordset[0].currentDB);
        
        await testPool.close();
        return true;
    } catch (err) {
        console.error('❌ Database connection error during test:');
        console.error(util.inspect(err, { depth: null, colors: true }));   // in full object
        if (err.originalError) {
            console.error('🔎 originalError =', util.inspect(err.originalError, { depth: null, colors: true }));
        }
        if (err.precedingErrors) {
            console.error('🔎 precedingErrors =', util.inspect(err.precedingErrors, { depth: null, colors: true }));
        }
        return false;
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT. Closing database connection...');
    await closeDB();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM. Closing database connection...');
    await closeDB();
    process.exit(0);
});

module.exports = {
    connectDB,
    getPool,
    closeDB,
    testConnection,
    sql
};
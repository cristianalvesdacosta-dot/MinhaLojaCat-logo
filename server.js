const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Disponibiliza a pasta atual para servir arquivos estáticos (como o index.html)
app.use(express.static(__dirname));

// -------------------------------------------------------------
// BANCO DE DADOS (SQLite)
// -------------------------------------------------------------
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Erro ao abrir o banco de dados', err.message);
    else console.log('Conectado ao banco de dados SQLite com sucesso.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_name TEXT NOT NULL,
        store_token TEXT UNIQUE NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        title TEXT,
        price REAL,
        description TEXT,
        images TEXT,
        video_url TEXT,
        source_link TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id)
    )`);

    // Lojas de teste iniciais para validação
    db.get(`SELECT COUNT(*) as count FROM stores`, (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO stores (store_name, store_token) VALUES ('Loja do Cristian', 'token-cristian-123')`);
            db.run(`INSERT INTO stores (store_name, store_token) VALUES ('Loja do Parceiro', 'token-parceiro-456')`);
            console.log('Lojas de exemplo criadas: Tokens "token-cristian-123" e "token-parceiro-456"');
        }
    });
});

// -------------------------------------------------------------
// MIDDLEWARE DE SEGURANÇA (Isolamento por Token)
// -------------------------------------------------------------
function verifyStoreToken(req, res, next) {
    const storeToken = req.headers['x-store-token'] || req.body.store_token;
    
    if (!storeToken) {
        return res.status(401).json({ error: 'Acesso negado. Token de segurança da loja não fornecido.' });
    }

    db.get(`SELECT * FROM stores WHERE store_token = ?`, [storeToken], (err, store) => {
        if (err || !store) {
            return res.status(403).json({ error: 'Token inválido! Você não tem permissão para alterar esta loja.' });
        }
        req.store = store;
        next();
    });
}

// -------------------------------------------------------------
// ROTAS DA API
// -------------------------------------------------------------

// Verificar token e liberar painel exclusivo
app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;
    db.get(`SELECT id, store_name FROM stores WHERE store_token = ?`, [token], (err, store) => {
        if (err || !store) {
            return res.status(403).json({ error: 'Token inválido.' });
        }
        res.json({ success: true, store });
    });
});

// Importar produto via link (puxando fotos, descrição e vídeo)
app.post('/api/import-product', verifyStoreToken, (req, res) => {
    const { product_link } = req.body;
    const storeId = req.store.id;

    if (!product_link) {
        return res.status(400).json({ error: 'O link do produto é obrigatório.' });
    }

    // Simulação da extração completa via link (substitua pelo motor de scraper real quando quiser)
    const simulatedScrapedData = {
        title: `Produto Importado de: ${new URL(product_link).hostname}`,
        price: 149.90,
        description: `Descrição completa rica extraída de forma automatizada do link fornecido (${product_link}).`,
        images: JSON.stringify([
            "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500",
            "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
            "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500"
        ]),
        video_url: "https://www.w3schools.com/html/mov_bbb.mp4",
        source_link: product_link
    };

    const query = `INSERT INTO products (store_id, title, price, description, images, video_url, source_link) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(query, [
        storeId, 
        simulatedScrapedData.title, 
        simulatedScrapedData.price, 
        simulatedScrapedData.description, 
        simulatedScrapedData.images, 
        simulatedScrapedData.video_url, 
        simulatedScrapedData.source_link
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Erro ao salvar o produto no banco de dados.' });
        }
        res.json({ 
            success: true, 
            message: 'Produto importado com sucesso!', 
            product_id: this.lastID,
            product: simulatedScrapedData
        });
    });
});

// Listar produtos da vitrine da loja
app.get('/api/store/:storeId/products', (req, res) => {
    const storeId = req.params.storeId;

    db.all(`SELECT * FROM products WHERE store_id = ?`, [storeId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar produtos.' });
        
        const formattedRows = rows.map(item => ({
            ...item,
            images: JSON.parse(item.images || '[]')
        }));
        res.json(formattedRows);
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

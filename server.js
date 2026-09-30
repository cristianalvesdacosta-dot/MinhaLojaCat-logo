const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Erro ao abrir o banco de dados', err.message);
    else console.log('Conectado ao banco de dados SQLite com sucesso.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_name TEXT NOT NULL,
        store_token TEXT UNIQUE NOT NULL,
        store_slug TEXT UNIQUE NOT NULL
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
});

// Middleware de segurança por Token
function verifyStoreToken(req, res, next) {
    const storeToken = req.headers['x-store-token'] || req.body.store_token;
    if (!storeToken) {
        return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    db.get(`SELECT * FROM stores WHERE store_token = ?`, [storeToken], (err, store) => {
        if (err || !store) {
            return res.status(403).json({ error: 'Token inválido ou loja não encontrada.' });
        }
        req.store = store;
        next();
    });
}

// Rota para cadastrar nova loja
app.post('/api/register-store', (req, res) => {
    const { store_name, store_token } = req.body;
    if (!store_name || !store_token) {
        return res.status(400).json({ error: 'Preencha o nome da loja e a chave secreta.' });
    }

    const store_slug = store_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    db.run(`INSERT INTO stores (store_name, store_token, store_slug) VALUES (?, ?, ?)`, [store_name, store_token, store_slug], function(err) {
        if (err) {
            return res.status(400).json({ error: 'Esta chave secreta ou nome de loja já está em uso.' });
        }
        res.json({ success: true, store: { id: this.lastID, store_name, store_slug } });
    });
});

// Verificar token para login
app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;
    db.get(`SELECT id, store_name, store_slug FROM stores WHERE store_token = ?`, [token], (err, store) => {
        if (err || !store) {
            return res.status(403).json({ error: 'Chave secreta não encontrada.' });
        }
        res.json({ success: true, store });
    });
});

// Rota pública para o cliente visualizar APENAS a loja específica
app.get('/api/public/store/:slug', (req, res) => {
    const slug = req.params.slug;
    db.get(`SELECT id, store_name FROM stores WHERE store_slug = ?`, [slug], (err, store) => {
        if (err || !store) {
            return res.status(404).json({ error: 'Loja não encontrada.' });
        }
        db.all(`SELECT * FROM products WHERE store_id = ?`, [store.id], (err, products) => {
            if (err) return res.status(500).json({ error: 'Erro ao carregar produtos.' });
            const formattedProducts = products.map(p => ({
                ...p,
                images: JSON.parse(p.images || '[]')
            }));
            res.json({ store, products: formattedProducts });
        });
    });
});

// Importar produto via link (somente lojista autenticado)
app.post('/api/import-product', verifyStoreToken, (req, res) => {
    const { product_link } = req.body;
    const storeId = req.store.id;

    if (!product_link) {
        return res.status(400).json({ error: 'O link do produto é obrigatório.' });
    }

    const simulatedScrapedData = {
        title: `Produto Importado (${new URL(product_link).hostname})`,
        price: 159.90,
        description: `Descrição exclusiva da vitrine. Importado de: ${product_link}`,
        images: JSON.stringify([
            "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500",
            "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500"
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
        if (err) return res.status(500).json({ error: 'Erro ao salvar o produto.' });
        res.json({ success: true, message: 'Produto cadastrado com sucesso na sua vitrine!', product: simulatedScrapedData });
    });
});

// Listar produtos no painel do lojista
app.get('/api/store/:storeId/products', verifyStoreToken, (req, res) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

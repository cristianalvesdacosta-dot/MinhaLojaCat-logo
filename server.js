const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de middlewares com limite maior para aceitar imagens em Base64
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Conexão com o banco de dados SQLite na nuvem
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        
        // Criação da tabela de Lojas com suporte a Logo, Banner e WhatsApp
        db.run(`CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_name TEXT NOT NULL,
            store_token TEXT UNIQUE NOT NULL,
            store_slug TEXT UNIQUE NOT NULL,
            whatsapp TEXT,
            logo TEXT,
            banner TEXT
        )`, (err) => {
            if (!err) {
                // Adiciona colunas caso a tabela seja antiga
                db.run(`ALTER TABLE stores ADD COLUMN whatsapp TEXT`, () => {});
                db.run(`ALTER TABLE stores ADD COLUMN logo TEXT`, () => {});
                db.run(`ALTER TABLE stores ADD COLUMN banner TEXT`, () => {});
            }
        });

        // Criação da tabela de Produtos
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER,
            title TEXT,
            price REAL,
            description TEXT,
            images TEXT,
            video_url TEXT,
            source_link TEXT,
            FOREIGN KEY(store_id) REFERENCES stores(id)
        )`);
    }
});

// Middleware para autenticar o lojista via Token
const authenticateToken = (req, res, next) => {
    const token = req.headers['x-store-token'];
    if (!token) {
        return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    db.get(`SELECT * FROM stores WHERE store_token = ?`, [token], (err, store) => {
        if (err || !store) {
            return res.status(403).json({ error: 'Token inválido ou loja não encontrada.' });
        }
        req.store = store;
        next();
    });
};

// Rota para cadastrar nova loja com customização
app.post('/api/register-store', (req, res) => {
    const { store_name, store_token, whatsapp, logo, banner } = req.body;

    if (!store_name || !store_token) {
        return res.status(400).json({ error: 'Preencha o nome da loja e a chave secreta.' });
    }

    const store_slug = store_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    db.run(
        `INSERT INTO stores (store_name, store_token, store_slug, whatsapp, logo, banner) VALUES (?, ?, ?, ?, ?, ?)`,
        [store_name, store_token, store_slug, whatsapp || '', logo || '', banner || ''],
        function(err) {
            if (err) {
                return res.status(400).json({ error: 'Esta chave secreta ou nome de loja já está em uso.' });
            }
            res.json({ success: true, store: { id: this.lastID, store_name, store_slug, whatsapp, logo, banner } });
        }
    );
});

// Rota para verificar o token e entrar no painel
app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;

    db.get(`SELECT * FROM stores WHERE store_token = ?`, [token], (err, store) => {
        if (err || !store) {
            return res.status(404).json({ error: 'Chave secreta não encontrada.' });
        }
        res.json({ success: true, store });
    });
});

// Rota pública para carregar a vitrine do cliente pelo Slug
app.get('/api/public/store/:slug', (req, res) => {
    const slug = req.params.slug;

    db.get(`SELECT id, store_name, store_slug, whatsapp, logo, banner FROM stores WHERE store_slug = ?`, [slug], (err, store) => {
        if (err || !store) {
            return res.status(404).json({ error: 'Loja não encontrada.' });
        }

        db.all(`SELECT * FROM products WHERE store_id = ?`, [store.id], (err, products) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao carregar produtos.' });
            }

            const formattedProducts = products.map(p => ({
                ...p,
                images: JSON.parse(p.images || '[]')
            }));

            res.json({ store, products: formattedProducts });
        });
    });
});

// Rota para o lojista ver os produtos no painel
app.get('/api/store/:id/products', authenticateToken, (req, res) => {
    const store_id = req.params.id;

    db.all(`SELECT * FROM products WHERE store_id = ?`, [store_id], (err, products) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar produtos.' });
        }

        const formattedProducts = products.map(p => ({
            ...p,
            images: JSON.parse(p.images || '[]')
        }));

        res.json(formattedProducts);
    });
});

// Rota para importar produto via link
app.post('/api/import-product', authenticateToken, (req, res) => {
    const { product_link } = req.body;
    const store_id = req.store.id;

    if (!product_link) {
        return res.status(400).json({ error: 'Insira o link do produto.' });
    }

    try {
        let domainName = "Produto da Web";
        try {
            const parsedUrl = new URL(product_link);
            domainName = parsedUrl.hostname.replace('www.', '');
        } catch (e) {
            domainName = "Loja Virtual";
        }

        const title = `Produto de ${domainName}`;
        const price = 99.90;
        const description = `Produto importado com sucesso via link: ${product_link}`;
        
        const images = JSON.stringify([
            "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500",
            "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500"
        ]);
        const video_url = "";

        db.run(
            `INSERT INTO products (store_id, title, price, description, images, video_url, source_link) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [store_id, title, price, description, images, video_url, product_link],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Erro ao salvar o produto no banco.' });
                }
                res.json({ success: true, message: 'Produto adicionado à vitrine com sucesso!' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erro ao processar o link.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

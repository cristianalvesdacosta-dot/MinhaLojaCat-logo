// Rota para importar produto via link
app.post('/api/import-product', authenticateToken, (req, res) => {
    const { product_link } = req.body;
    const store_id = req.store.id;

    if (!product_link) {
        return res.status(400).json({ error: 'Insira o link do produto.' });
    }

    try {
        // Identifica de qual site é o link para personalizar o título
        let domainName = "Produto da Web";
        try {
            const parsedUrl = new URL(product_link);
            domainName = parsedUrl.hostname.replace('www.', '');
        } catch (e) {
            domainName = "Loja Virtual";
        }

        const title = `Produto de ${domainName}`;
        const price = 99.90; // Preço padrão inicial editável
        const description = `Produto importado com sucesso via link: ${product_link}`;
        
        // Imagens de exemplo dinâmicas ou placeholders limpos
        const images = JSON.stringify([
            "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500",
            "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500"
        ]);
        const video_url = ""; // Sem vídeo fixo para evitar repetição

        db.run(
            `INSERT INTO products (store_id, title, price, description, images, video_url, source_link) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [store_id, title, price, description, images, video_url, product_link],
            function(err) {
                if (err) {
                    console.error("Erro ao salvar produto:", err.message);
                    return res.status(500).json({ error: 'Erro ao salvar o produto no banco.' });
                }
                res.json({ success: true, message: 'Produto importado e adicionado à vitrine com sucesso!' });
            }
        );

    } catch (error) {
        console.error("Erro na importação:", error);
        res.status(500).json({ error: 'Erro ao processar o link.' });
    }
});

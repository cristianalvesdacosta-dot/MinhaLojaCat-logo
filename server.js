// Rota para cadastrar nova loja
app.post('/api/register-store', (req, res) => {
    const { store_name, store_token } = req.body;
    console.log("Tentando cadastrar loja:", store_name, store_token); // Adicionado para depurar

    if (!store_name || !store_token) {
        return res.status(400).json({ error: 'Preencha o nome da loja e a chave secreta.' });
    }

    const store_slug = store_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    db.run(`INSERT INTO stores (store_name, store_token, store_slug) VALUES (?, ?, ?)`, [store_name, store_token, store_slug], function(err) {
        if (err) {
            console.error("Erro ao inserir no banco:", err.message); // Mostra o erro real no log do Render
            return res.status(400).json({ error: 'Esta chave secreta ou nome de loja já está em uso.' });
        }
        console.log("Loja cadastrada com ID:", this.lastID);
        res.json({ success: true, store: { id: this.lastID, store_name, store_slug } });
    });
});

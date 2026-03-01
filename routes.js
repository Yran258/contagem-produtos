const express = require('express');
const ExcelJS = require('exceljs');
const db = require('./database');

const router = express.Router();

// Listar produtos
router.get('/produtos', (req, res) => {
    db.all("SELECT * FROM produtos", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Cadastrar produto
router.post('/produtos', (req, res) => {
    const { codigo, descricao, quantidade } = req.body;

    db.run(
        "INSERT INTO produtos (codigo, descricao, quantidade) VALUES (?, ?, ?)",
        [codigo, descricao, quantidade],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID });
        }
    );
});

// Exportar para Excel
router.get('/exportar', async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventario');

    sheet.columns = [
        { header: 'Código', key: 'codigo' },
        { header: 'Descrição', key: 'descricao' },
        { header: 'Quantidade', key: 'quantidade' }
    ];

    db.all("SELECT * FROM produtos", [], async (err, rows) => {
        rows.forEach(row => sheet.addRow(row));

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=inventario.xlsx'
        );

        await workbook.xlsx.write(res);
        res.end();
    });
});
// Excluir produto
router.delete('/produtos/:id', (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM produtos WHERE id = ?", [id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json({ mensagem: "Produto excluído com sucesso" });
    });
});
module.exports = router;
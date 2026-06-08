const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
 //routes//
 //create a todo//

 app.post('/todos', async (req, res) => {
     try {
         const { description } = req.body;
        const newTodo = await pool.query('INSERT INTO todo (description) VALUES ($1) RETURNING todo_id AS id, description', [description]);
         res.json(newTodo.rows[0]);
     } catch (err) {
         console.error(err.message);
         res.status(500).json({ error: 'Failed to create todo' });
     }
 });
 //get all todos
app.get('/todos', async (req, res) => {
    try {
        const alltodos = await pool.query('SELECT todo_id AS id, description FROM todo ORDER BY todo_id ASC');
        res.json(alltodos.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch todos' });
    }
});

//get a todo
app.get('/todos/:id', async (req, res) => {
    try {   
        const { id } = req.params;
        const todo = await pool.query('SELECT todo_id AS id, description FROM todo WHERE todo_id = $1', [id]);
        res.json(todo.rows[0] || null);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch todo' });
    }
});

//update a todo
app.put('/todos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { description } = req.body;
        await pool.query('UPDATE todo SET description = $1 WHERE todo_id = $2', [description, id]);
        res.json({ message: 'Todo was updated!' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to update todo' });
    }
});

//delete a todo
app.delete('/todos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM todo WHERE todo_id = $1', [id]);
        res.json({ message: 'Todo was deleted!' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});


app.listen(5000, () => {console.log('Server is running on port 5000');});
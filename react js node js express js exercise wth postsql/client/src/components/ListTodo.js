import React, { Fragment, useEffect, useState } from "react";
import EditTodo from "./EditTodo";

const ListTodo = () => {
  const [todos, setTodos] = useState([]);
  const [editingTodo, setEditingTodo] = useState(null);

  const getTodos = async () => {
    try {
      const response = await fetch("http://localhost:5000/todos");
      const jsonData = await response.json();
      setTodos(jsonData);
    } catch (err) {
      console.error(err.message);
    }
  };

  const deleteTodo = async (id) => {
    try {
      await fetch(`http://localhost:5000/todos/${id}`, {
        method: "DELETE",
      });
      setTodos(todos.filter((todo) => todo.id !== id));
    } catch (err) {
      console.error(err.message);
    }
  };

  useEffect(() => {
    getTodos();
  }, []);

  const handleEditComplete = () => {
    setEditingTodo(null);
    getTodos();
  };

  return (
    <Fragment>
      <div className="container mt-5">
        <table className="table table-hover text-center align-middle">
          <thead className="table-dark">
            <tr>
              <th>Description</th>
              <th style={{ width: "140px" }}>Edit</th>
              <th style={{ width: "140px" }}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {todos.map((todo) => (
              <tr key={todo.id}>
                <td className="text-start">{todo.description}</td>
                <td>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setEditingTodo(todo)}
                  >
                    Edit
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => deleteTodo(todo.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {todos.length === 0 && (
              <tr>
                <td colSpan="3" className="text-muted py-4">
                  No todos yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingTodo && (
        <EditTodo todo={editingTodo} onDone={handleEditComplete} onCancel={() => setEditingTodo(null)} />
      )}
    </Fragment>
  );
};

export default ListTodo;

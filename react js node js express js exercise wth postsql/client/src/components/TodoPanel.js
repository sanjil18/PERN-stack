/* eslint-disable react/prop-types */
import React, { useEffect, useState } from 'react';

const TodoPanel = ({ todos, onCreate, onUpdate, onDelete }) => {
  const [newTodo, setNewTodo] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingId && !todos.some((todo) => todo.id === editingId)) {
      setEditingId(null);
      setEditingText('');
    }
  }, [todos, editingId]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      await onCreate(newTodo);
      setNewTodo('');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      await onUpdate(editingId, editingText);
      setEditingId(null);
      setEditingText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2>Your todo list</h2>
        </div>
        <span className="pill">{todos.length} items</span>
      </div>

      <form className="todo-form" onSubmit={handleCreate}>
        <input
          type="text"
          value={newTodo}
          onChange={(event) => setNewTodo(event.target.value)}
          placeholder="Add a new task"
          required
        />
        <button className="primary-button" type="submit" disabled={saving}>
          Add task
        </button>
      </form>

      <div className="todo-list">
        {todos.length === 0 ? (
          <div className="empty-state">No tasks yet. Add one above.</div>
        ) : (
          todos.map((todo) => (
            <article className="todo-item" key={todo.id}>
              {editingId === todo.id ? (
                <form className="todo-edit-form" onSubmit={handleSaveEdit}>
                  <input value={editingText} onChange={(event) => setEditingText(event.target.value)} required />
                  <div className="inline-actions">
                    <button className="primary-button" type="submit" disabled={saving}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        setEditingId(null);
                        setEditingText('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <p>{todo.description}</p>
                    <span>Task #{todo.id}</span>
                  </div>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        setEditingId(todo.id);
                        setEditingText(todo.description);
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="ghost-button danger" onClick={() => onDelete(todo.id)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export default TodoPanel;
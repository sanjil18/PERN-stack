import React, { Fragment, useState } from "react";
import "../App.css";

const InputTodo = () => {
    const [description, setDescription] = useState("");

    const onSubmitForm = async (e) => {
        e.preventDefault();
        try {
            const body = { description };
            await fetch("http://localhost:5000/todos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            window.location = "/";
        } catch (err) {
            console.error(err.message);
        }
    };

    return (
        <Fragment>
            <div className="container">
                <h1 className="text-center mt-5">pern Todo</h1>
                <form className="d-flex mt-5" onSubmit={onSubmitForm}>
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Enter todo description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <button className="btn btn-success">Add</button>
                </form>
            </div>
        </Fragment>
    );
};

export default InputTodo;
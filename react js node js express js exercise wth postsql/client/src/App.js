
import './App.css';

import InputTodo from "./components/inputTodo";
import ListTodo from "./components/ListTodo";
function App() {
  return (
    <div className="App">
      <h1>Welcome to the To-Do App!</h1>
      <InputTodo />
      <ListTodo />
    </div>
  );
}

export default App;

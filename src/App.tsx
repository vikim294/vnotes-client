import { Routes, Route } from 'react-router'
import NoteList from './pages/NoteList'
import NoteDetail from './pages/NoteDetail'
import Login from './pages/Login'
import Register from './pages/Register'

const App = () => {
  return (
    <Routes>
      <Route path='/login' element={<Login />} />
      <Route path='/register' element={<Register />} />
      <Route path='/' element={<NoteList />} />
      <Route path='/noteDetails/:id' element={<NoteDetail />} />
    </Routes>
  )
}

export default App

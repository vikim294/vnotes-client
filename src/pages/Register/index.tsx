import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import AuthLayout from '../../components/AuthLayout'
import { useState } from 'react'
import { API_BASE_URL } from '../../api'
import { Toast } from '../../components/Toast'

const Register = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  return (
    <AuthLayout
      eyebrow='Start your journey'
      title='创建账号'
      description='加入 VNote，开始构建你的知识空间。'
    >
      <form className='auth-form auth-form-compact'>
        <label className='auth-field'>
          <span>昵称</span>
          <div className='auth-input-wrap'>
            <UserRound size={18} />
            <input
              type='TEXT'
              placeholder='你的昵称'
              autoComplete='name'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </label>

        <label className='auth-field'>
          <span>邮箱</span>
          <div className='auth-input-wrap'>
            <Mail size={18} />
            <input
              type='email'
              placeholder='name@example.com'
              autoComplete='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </label>

        <label className='auth-field'>
          <span>密码</span>
          <div className='auth-input-wrap'>
            <LockKeyhole size={18} />
            <input
              type='password'
              placeholder='至少 8 位'
              autoComplete='new-password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </label>

        <button
          className='auth-submit'
          type='button'
          onClick={() => {
            console.log(username, email, password)

            fetch(API_BASE_URL + '/user/register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                username,
                email,
                password,
              }),
            })
              .then((res) => res.json())
              .then((res) => {
                if (res.code !== 0) {
                  return Toast.warning(res.message)
                }

                Toast.success(res.message)

                setTimeout(() => {
                  navigate('/login')
                }, 2000)
              })
          }}
        >
          创建账号
          <ArrowRight size={18} />
        </button>
      </form>

      <p className='auth-switch'>
        已有账号？ <Link to='/login'>返回登录</Link>
      </p>
    </AuthLayout>
  )
}

export default Register

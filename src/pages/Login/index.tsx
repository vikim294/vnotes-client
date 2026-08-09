import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import AuthLayout from '../../components/AuthLayout'
import { useState } from 'react'
import { Toast } from '../../components/Toast'
import { API_BASE_URL } from '../../api'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  return (
    <AuthLayout eyebrow='Welcome back' title='登录 VNote' description='继续整理你的思考与灵感。'>
      <form className='auth-form'>
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
              placeholder='请输入密码'
              autoComplete='current-password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </label>

        <div className='auth-options'>
          <a href='#'>忘记密码？</a>
        </div>

        <button
          className='auth-submit'
          type='button'
          onClick={() => {
            fetch(API_BASE_URL + '/auth/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
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

                localStorage.setItem('vnotes-token', res.data.accessToken)

                setTimeout(() => {
                  navigate('/')
                }, 2000)
              })
          }}
        >
          登录
          <ArrowRight size={18} />
        </button>
      </form>

      <p className='auth-switch'>
        还没有账号？ <Link to='/register'>立即注册</Link>
      </p>
    </AuthLayout>
  )
}

export default Login

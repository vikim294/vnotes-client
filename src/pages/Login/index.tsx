import { ArrowRight, KeyRound, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import AuthLayout from '../../components/AuthLayout'
import { useEffect, useRef, useState } from 'react'
import { Toast } from '../../components/Toast'
import {
  API_BASE_URL,
  exchangeOAuthLoginCode,
  loginByEmailAndPassword,
  loginByEmailAndVerificationCode,
  sendLoginVerificationCode,
} from '../../api'
import { saveAuthSession } from '../../authSession'

type LoginMethod = 'password' | 'verificationCode'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password')
  const [countdown, setCountdown] = useState(0)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [oauthLoginCode] = useState(() => new URLSearchParams(window.location.search).get('loginCode'))
  const [isExchangingOAuthToken, setIsExchangingOAuthToken] = useState(Boolean(oauthLoginCode))
  const [isRedirectingToGoogle, setIsRedirectingToGoogle] = useState(false)
  const oauthExchangeStartedRef = useRef(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!oauthLoginCode || oauthExchangeStartedRef.current) return
    oauthExchangeStartedRef.current = true

    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('loginCode')
    window.history.replaceState(
      null,
      '',
      `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`,
    )

    void exchangeOAuthLoginCode(oauthLoginCode)
      .then((res) => {
        saveAuthSession(res.data.accessToken, res.data.expiresIn)
        Toast.success('Google 登录成功')
        navigate('/', { replace: true })
      })
      .catch((error: unknown) => {
        Toast.warning(error instanceof Error ? error.message : 'Google 登录失败')
        setIsExchangingOAuthToken(false)
      })
  }, [navigate, oauthLoginCode])

  useEffect(() => {
    if (countdown <= 0) return

    const timer = window.setTimeout(() => {
      setCountdown((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [countdown])

  const handleSendVerificationCode = async () => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      Toast.warning('请先输入邮箱')
      return
    }

    setIsSendingCode(true)
    try {
      const res = await sendLoginVerificationCode(normalizedEmail)
      Toast.success(res.message)
      setCountdown(60)
    } catch (error) {
      Toast.warning(error instanceof Error ? error.message : '验证码发送失败')
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      Toast.warning('请输入邮箱')
      return
    }
    if (loginMethod === 'password' && !password) {
      Toast.warning('请输入密码')
      return
    }
    if (loginMethod === 'verificationCode' && !/^\d{4}$/.test(verificationCode)) {
      Toast.warning('请输入 4 位数字验证码')
      return
    }

    setIsLoggingIn(true)
    try {
      const res =
        loginMethod === 'password'
          ? await loginByEmailAndPassword(normalizedEmail, password)
          : await loginByEmailAndVerificationCode(normalizedEmail, verificationCode)

      saveAuthSession(res.data.accessToken, res.data.expiresIn)
      Toast.success(res.message)
      navigate('/')
    } catch (error) {
      Toast.warning(error instanceof Error ? error.message : '登录失败')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleGoogleLogin = () => {
    setIsRedirectingToGoogle(true)
    window.location.assign(`${API_BASE_URL}/oauth/google/login`)
  }

  if (isExchangingOAuthToken) {
    return (
      <AuthLayout
        eyebrow='Welcome back'
        title='正在完成登录'
        description='正在安全地连接你的 VNote 账号。'
      >
        <div className='auth-oauth-status' role='status' aria-live='polite'>
          <LoaderCircle size={28} className='auth-spinner' />
          <strong>正在验证 Google 登录</strong>
          <span>即将进入你的笔记空间，请稍候…</span>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout eyebrow='Welcome back' title='登录 VNote' description='继续整理你的思考与灵感。'>
      <form className='auth-form' onSubmit={handleLogin}>
        <div className='auth-method-tabs' role='tablist' aria-label='登录方式'>
          <button
            type='button'
            role='tab'
            aria-selected={loginMethod === 'password'}
            className={`auth-method-tab ${loginMethod === 'password' ? 'is-active' : ''}`}
            onClick={() => setLoginMethod('password')}
          >
            密码登录
          </button>
          <button
            type='button'
            role='tab'
            aria-selected={loginMethod === 'verificationCode'}
            className={`auth-method-tab ${loginMethod === 'verificationCode' ? 'is-active' : ''}`}
            onClick={() => setLoginMethod('verificationCode')}
          >
            验证码登录
          </button>
        </div>

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

        {loginMethod === 'password' ? (
          <>
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
          </>
        ) : (
          <label className='auth-field'>
            <span>验证码</span>
            <div className='auth-code-row'>
              <div className='auth-input-wrap'>
                <KeyRound size={18} />
                <input
                  type='text'
                  inputMode='numeric'
                  pattern='[0-9]*'
                  maxLength={4}
                  placeholder='4 位验证码'
                  autoComplete='one-time-code'
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
              <button
                type='button'
                className='auth-code-button'
                disabled={isSendingCode || countdown > 0}
                onClick={() => void handleSendVerificationCode()}
              >
                {isSendingCode ? (
                  <LoaderCircle size={16} className='auth-spinner' />
                ) : countdown > 0 ? (
                  `${countdown}s 后重试`
                ) : (
                  '获取验证码'
                )}
              </button>
            </div>
          </label>
        )}

        <button className='auth-submit' type='submit' disabled={isLoggingIn}>
          {isLoggingIn ? (
            <>
              <LoaderCircle size={18} className='auth-spinner' />
              正在登录
            </>
          ) : (
            <>
              登录
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <div className='auth-divider' aria-hidden='true'>
          <span>或</span>
        </div>

        <button
          className='auth-google-button'
          type='button'
          disabled={isLoggingIn || isRedirectingToGoogle}
          onClick={handleGoogleLogin}
        >
          {isRedirectingToGoogle ? (
            <LoaderCircle size={18} className='auth-spinner' />
          ) : (
            <span className='auth-google-mark' aria-hidden='true'>G</span>
          )}
          {isRedirectingToGoogle ? '正在跳转…' : '使用 Google 登录'}
        </button>
      </form>

      <p className='auth-switch'>
        还没有账号？ <Link to='/register'>立即注册</Link>
      </p>
    </AuthLayout>
  )
}

export default Login

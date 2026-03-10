/** @jsxRuntime classic */
/** @jsx jsx */
import Link from 'next/link'
import Image from 'next/image'
import { jsx } from '@keystone-ui/core'
import logo from "../images/logo-icon.svg"

export const CustomLogo = () => {
  return (
    <div >
        <Link href="/" css={{ display: 'flex', alignItems: "center", textDecoration: "none" }}>
          <Image src={logo} width="60" height="44" alt="" />
          <h3 css={{
            // TODO: we don't have colors in our design-system for this.
            backgroundImage: `linear-gradient(to right, #4A7639, #729b62)`,
            backgroundClip: 'text',
            lineHeight: '1.75rem',
            color: 'transparent',
            verticalAlign: 'middle',
            transition: 'color 0.3s ease',
            textDecoration: 'none',
          }}>Green Mountain Cannabis</h3>
        </Link>
    </div>
  )
}
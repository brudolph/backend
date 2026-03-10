import { config } from '@keystone-6/core'
import { lists } from './schema'
import { extendGraphqlSchema } from './mutations'
import { withAuth, session } from './auth'
import { createGoogleSheetsRouter } from './routes/googleSheets'

export default withAuth(
  config({
    server: {
      cors: {
        origin: process.env.NODE_ENV === 'production' ? [process.env.FRONTEND_URL_PROD!] : true,
        credentials: true,
      },
      extendExpressApp: (app, commonContext) => {
        app.use('/api', createGoogleSheetsRouter(commonContext));
      },
    },
    db: {
      provider: 'sqlite',
      url: 'file:./keystone.db',
    },
    lists,
    session,
    graphql: {
      extendGraphqlSchema,
    },
  })
)

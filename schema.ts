import { list } from '@keystone-6/core'
import { allowAll } from '@keystone-6/core/access'
import {
  text,
  relationship,
  password,
  timestamp,
  select,
  integer,
  float,
} from '@keystone-6/core/fields'
import { type Lists } from '.keystone/types'

export const lists = {
  User: list({
    access: allowAll,
    fields: {
      name: text({ validation: { isRequired: true } }),
      email: text({
        validation: { isRequired: true },
        isIndexed: 'unique',
      }),
      password: password({ validation: { isRequired: true } }),
      createdAt: timestamp({
        defaultValue: { kind: 'now' },
      }),
    },
  }),

  Product: list({
    access: allowAll,
    fields: {
      name: text({ validation: { isRequired: true } }),
      potency: text(),
      environment: text(),
      priceMin: integer(),
      priceMax: integer(),
      inventory: float(),
      strain: text(),
      category: text(),
      useByDate: text(),
      imageUrl: text(),
      description: text({ ui: { displayMode: 'textarea' } }),
      inStock: integer({ defaultValue: 0 }),
    },
  }),

  Order: list({
    access: allowAll,
    fields: {
      customerName: text({ validation: { isRequired: true } }),
      customerEmail: text({ validation: { isRequired: true } }),
      status: select({
        options: [
          { label: 'Pending', value: 'pending' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Shipped', value: 'shipped' },
          { label: 'Cancelled', value: 'cancelled' },
        ],
        defaultValue: 'pending',
        ui: { displayMode: 'segmented-control' },
      }),
      items: relationship({ ref: 'OrderItem.order', many: true }),
      createdAt: timestamp({ defaultValue: { kind: 'now' } }),
    },
  }),

  OrderItem: list({
    access: allowAll,
    fields: {
      order: relationship({ ref: 'Order.items' }),
      product: relationship({ ref: 'Product' }),
      quantity: float({ validation: { isRequired: true } }),
      priceMinAtTime: integer(),
      priceMaxAtTime: integer(),
    },
  }),
} satisfies Lists

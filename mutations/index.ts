import { mergeSchemas } from '@graphql-tools/schema';
import { GraphQLSchema } from 'graphql';
import { appendOrderToSheet, updateInventoryInSheet } from '../routes/googleSheets';

const typeDefs = `
  type SubmitOrderResult {
    success: Boolean!
    orderId: String
    message: String!
  }

  input OrderItemInput {
    productId: ID!
    quantity: Float!
  }

  extend type Mutation {
    submitOrder(
      customerName: String!
      customerEmail: String!
      items: [OrderItemInput!]!
    ): SubmitOrderResult!
  }
`;

export const extendGraphqlSchema = (schema: GraphQLSchema) =>
  mergeSchemas({
    schemas: [schema],
    typeDefs,
    resolvers: {
      Mutation: {
        submitOrder: async (
          _root: unknown,
          { customerName, customerEmail, items }: {
            customerName: string;
            customerEmail: string;
            items: Array<{ productId: string; quantity: number }>;
          },
          context: any
        ) => {
          const sudoContext = context.sudo();

          // 1. Validate all products and check inventory
          const productDetails: Array<{
            id: string;
            name: string;
            category: string;
            priceMin: number;
            priceMax: number;
            inventory: number;
            requestedQty: number;
          }> = [];

          for (const item of items) {
            const product = await sudoContext.query.Product.findOne({
              where: { id: item.productId },
              query: 'id name category priceMin priceMax inventory inStock',
            });

            if (!product) {
              return { success: false, orderId: null, message: `Product not found: ${item.productId}` };
            }
            if (product.inventory < item.quantity) {
              return { success: false, orderId: null, message: `Insufficient inventory for ${product.name} (available: ${product.inventory} lbs)` };
            }

            productDetails.push({
              id: product.id,
              name: product.name,
              category: product.category || '',
              priceMin: product.priceMin || 0,
              priceMax: product.priceMax || 0,
              inventory: product.inventory || 0,
              requestedQty: item.quantity,
            });
          }

          // 2. Create Order
          const order = await sudoContext.query.Order.createOne({
            data: {
              customerName,
              customerEmail,
              status: 'confirmed',
            },
            query: 'id createdAt',
          });

          // 3. Create OrderItems and decrement inventory
          for (const detail of productDetails) {
            await sudoContext.query.OrderItem.createOne({
              data: {
                order: { connect: { id: order.id } },
                product: { connect: { id: detail.id } },
                quantity: detail.requestedQty,
                priceMinAtTime: detail.priceMin,
                priceMaxAtTime: detail.priceMax,
              },
            });

            const newInventory = detail.inventory - detail.requestedQty;
            await sudoContext.query.Product.updateOne({
              where: { id: detail.id },
              data: {
                inventory: newInventory,
                inStock: newInventory > 0 ? 1 : 0,
              },
            });

            // Fire-and-forget: update inventory in Google Sheet
            updateInventoryInSheet(detail.name, detail.category, newInventory).catch((err) =>
              console.error('Failed to update sheet inventory for', detail.name, err)
            );
          }

          // 4. Fire-and-forget: append order to Google Sheet "Orders" tab
          appendOrderToSheet({
            orderId: order.id,
            customerName,
            customerEmail,
            items: productDetails.map((d) => ({
              productName: d.name,
              quantity: d.requestedQty,
              priceMin: d.priceMin,
              priceMax: d.priceMax,
            })),
            createdAt: order.createdAt,
          }).catch((err) => console.error('Failed to append order to sheet:', err));

          return { success: true, orderId: order.id, message: 'Order placed successfully' };
        },
      },
    },
  });

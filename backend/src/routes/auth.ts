import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { email: string; password: string } }>(
    '/api/auth/login',
    { schema: { body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } },
    async (req, reply) => {
      const { email, password } = req.body
      const user = await fastify.prisma.user.findUnique({ where: { email } })
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply.code(401).send({ error: 'Email ou mot de passe incorrect' })
      }
      const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role })
      return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
    }
  )
}

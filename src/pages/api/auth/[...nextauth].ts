import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/prisma';
import { Role } from '@prisma/client';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            select: {
              id: true,
              name: true,
              email: true,
              password: true,
              role: true,
              adminId: true,
              isActive: true,
            }
          });

          if (!user) {
            return null;
          }

          // Check if user account is active
          if (!user.isActive) {
            throw new Error('Account disabled');
          }

          // If user is not a developer, check if their admin is active
          if (user.role !== 'DEVELOPER' && user.adminId) {
            const admin = await prisma.user.findUnique({
              where: { id: user.adminId },
              select: { isActive: true }
            });

            if (!admin?.isActive) {
              throw new Error('Account disabled');
            }
          }

          const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            adminId: user.adminId,
          };
        } catch (error) {
          console.error('Auth error:', error);
          if (error instanceof Error && error.message === 'Account disabled') {
            throw error;
          }
          return null;
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.adminId = user.adminId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!;
        session.user.role = token.role as Role;
        session.user.adminId = token.adminId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
};

export default NextAuth(authOptions);
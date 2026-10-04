import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import { User } from './entities/user.entity.js';
import { makeUser } from '../../../test/fixtures/user.fixture.js';

const mockUserRepository = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
};

/**
 * Email inconnu et mot de passe faux doivent renvoyer EXACTEMENT ceci.
 * La constante partagée rend l'intention explicite : si les deux réponses
 * divergeaient un jour, le temps de réponse ne serait plus la seule fuite.
 */
const INVALID_CREDENTIALS = {
  code: 'INVALID_CREDENTIALS',
  message: 'Email ou mot de passe invalide',
};

const PASSWORD = 'un-mot-de-passe-valide';

describe('AuthService', () => {
  let service: AuthService;
  let repository: typeof mockUserRepository;
  let passwordHash: string;

  // argon2 est volontairement lent. On paie le hachage une fois pour le
  // fichier, pas à chaque test.
  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        {
          provide: JwtService,
          useValue: { signAsync: vi.fn().mockResolvedValue('un-jeton') },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    repository = module.get<typeof mockUserRepository>(
      getRepositoryToken(User),
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('register', () => {
    it('refuse un email déjà utilisé', async () => {
      repository.findOne.mockResolvedValueOnce(makeUser());

      const error = await service
        .register({
          email: 'user@example.com',
          password: PASSWORD,
          name: 'Test User',
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        code: 'EMAIL_TAKEN',
        message: 'Cet email est déjà utilisé',
      });
    });
  });

  describe('login', () => {
    it('refuse un email inconnu', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const error = await service
        .login({ email: 'inconnu@example.com', password: PASSWORD })
        .catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toEqual(INVALID_CREDENTIALS);
    });

    it('refuse un mot de passe incorrect, à l identique', async () => {
      repository.findOne.mockResolvedValueOnce(makeUser({ passwordHash }));

      const error = await service
        .login({ email: 'user@example.com', password: PASSWORD + '-faux' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toEqual(INVALID_CREDENTIALS);
    });

    it('cherche en base avec l email demandé', async () => {
      // Le faux repository renvoie le même utilisateur quoi qu'on lui
      // demande : sans cette assertion, un service qui chercherait toujours
      // le même email passerait tous les autres tests.
      repository.findOne.mockResolvedValueOnce(makeUser({ passwordHash }));

      await service.login({ email: 'user@example.com', password: PASSWORD });

      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'user@example.com' } }),
      );
    });

    it('accepte le bon mot de passe et ne renvoie jamais le hash', async () => {
      const user = makeUser({ passwordHash });
      repository.findOne.mockResolvedValueOnce(user);

      const result = await service.login({
        email: user.email,
        password: PASSWORD,
      });

      // toEqual sur l'objet ENTIER : le test échoue si une clé en trop
      // apparaît, donc une fuite de passwordHash est attrapée ici.
      expect(result).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        autoApplyEnabled: user.autoApplyEnabled,
        createdAt: user.createdAt,
        token: 'un-jeton',
      });
    });
  });
});

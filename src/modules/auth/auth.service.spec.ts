import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { User } from './entities/user.entity.js';

const mockUserRepository = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
};

describe('AuthService', () => {
  let service: AuthService;
  let repository: typeof mockUserRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: vi.fn(),
          },
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should throw ConflictException if email is already taken', async () => {
      // Arrange
      const userExample = {
        id: '1',
        email: 'test@example.com',
        passwordHash: 'password',
        name: 'Test User',
      };
      repository.findOne.mockResolvedValueOnce({
        id: '1',
        email: userExample.email,
      });

      // Act

      const error = await service
        .register({
          email: userExample.email,
          password: userExample.passwordHash,
          name: userExample.name,
        })
        .catch((e) => e);

      // Assert
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        code: 'EMAIL_TAKEN',
        message: 'Cet email est déjà utilisé',
      });
    });
  });
});

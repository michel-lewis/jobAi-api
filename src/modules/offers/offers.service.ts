import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { Offer } from './entities/offer.entity.js';
import type { CreateOfferDto } from './dto/create-offer.dto.js';
import type { ListOffersQueryDto } from './dto/list-offers-query.dto.js';
import type { OfferDto, PaginatedOffersDto } from './dto/offer.dto.js';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(Offer) private readonly offers: Repository<Offer>,
  ) {}

  async create(userId: string, dto: CreateOfferDto): Promise<OfferDto> {
    const saved = await this.offers.save(
      this.offers.create({
        source: 'manual_paste',
        externalId: null,
        createdByUserId: userId,
        title: dto.title,
        company: dto.company,
        location: dto.location,
        description: dto.description,
        applyUrl: dto.applyUrl,
        applyChannel: 'manual_only',
      }),
    );

    return this.toDto(saved);
  }

  async findVisibleById(userId: string, id: string): Promise<OfferDto> {
    const offer = await this.offers.findOne({
      where: this.visibleToUser(userId, { id }),
    });

    if (!offer) {
      throw new NotFoundException({
        code: 'OFFER_NOT_FOUND',
        message: "Cette offre n'existe pas ou n'est pas accessible",
      });
    }

    return this.toDto(offer);
  }

  async listVisible(
    userId: string,
    query: ListOffersQueryDto,
  ): Promise<PaginatedOffersDto> {
    const [rows, total] = await this.offers.findAndCount({
      where: this.visibleToUser(userId),
      order: { createdAt: 'DESC', id: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });

    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * La seule méthode du projet qui compare `created_by_user_id`. Un tableau
   * de `where` TypeORM est un OU : chaque critère additionnel (`extra`,
   * typiquement l'id visé) doit donc être répété dans chaque branche plutôt
   * que placé à côté, sinon il ne s'appliquerait qu'à l'une des deux.
   *
   * `Offer` et son repository ne sont jamais exportés par `OffersModule` —
   * aucun autre code ne peut lire la table sans passer par cette méthode ou
   * par `create()` ci-dessus, qui ne lit jamais, n'écrit que la ligne du
   * propriétaire.
   */
  private visibleToUser(
    userId: string,
    extra: Partial<FindOptionsWhere<Offer>> = {},
  ): FindOptionsWhere<Offer>[] {
    return [
      { ...extra, createdByUserId: userId },
      { ...extra, createdByUserId: IsNull() },
    ];
  }

  private toDto(offer: Offer): OfferDto {
    return {
      id: offer.id,
      source: offer.source,
      createdByUserId: offer.createdByUserId,
      title: offer.title,
      company: offer.company,
      location: offer.location,
      description: offer.description,
      applyUrl: offer.applyUrl,
      applyChannel: offer.applyChannel,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }
}

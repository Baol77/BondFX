package bond.config;

import bond.fx.FxService;
import bond.rating.RatingService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

/**
 * Injects TTL configuration from application.properties into the
 * FxService and RatingService singletons at Spring startup.
 *
 * Properties:
 *   bondfx.cache.fx-ttl-hours     (default 4)
 *   bondfx.cache.rating-ttl-hours (default 4)
 *
 * Set to 0 to disable TTL (never auto-refresh).
 */
@Configuration
public class BondCacheConfig {

    @Value("${bondfx.cache.fx-ttl-hours:4}")
    private long fxTtlHours;

    @Value("${bondfx.cache.rating-ttl-hours:4}")
    private long ratingTtlHours;

    @PostConstruct
    public void configureCacheTtl() {
        FxService.getInstance().setTtlHours(fxTtlHours);
        RatingService.setTtlHours(ratingTtlHours);
        System.out.printf("⚙️  Cache TTL configured: FX=%dh, Rating=%dh%n", fxTtlHours, ratingTtlHours);
    }
}

export default {
    images: {
        "/images/hero.png": {
            originalSrc: "/images/hero.png",
            src: "/generated/images/hero.webp",
            sources: [
                { format: "webp", src: "/generated/images/hero.webp", type: "image/webp" },
            ],
            width: 800,
            height: 600,
            blurDataURL: "data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoIAAUAAkA4JZwAAud8uNkA/v098/9bW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1sA",
            blurWidth: 8,
            blurHeight: 6,
        },
        "/images/multi.png": {
            originalSrc: "/images/multi.png",
            src: "/generated/images/multi.avif",
            sources: [
                { format: "avif", src: "/generated/images/multi.avif", type: "image/avif" },
                { format: "webp", src: "/generated/images/multi.webp", type: "image/webp" },
            ],
            width: 400,
            height: 300,
        },
    },
};

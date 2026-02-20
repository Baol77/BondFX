package bond.scrape;

public final class CountryNormalizer {

    private CountryNormalizer() {}

    public static String normalize(String country) {
        if (country == null) return "";

        String upper = country.toUpperCase()
            // normalize all "Italia" instruments first
            .replaceAll("\\b(BTP\\s+ITALIA|BTPI|BTP)\\b", "ITALIA")
            // remove unwanted keywords
            .replaceAll("\\b(GREEN|BOND|FUTURA|VALORE)\\b", "")
            .replace(" PIU'", "")
            // normalize spaces
            .replaceAll("\\s+", " ")
            .trim();

        return switch (upper) {
            case "ITALY", "ITALIA", "REPUBLIC OF ITALY", "REPUBBLICA ITALIANA", "ITALYI", "ITALY ITALIA" -> "ITALIA";
            case "SWITZERLAND" -> "SVIZZERA";
            case "LUXEMBOURG" -> "LUSSEMBURGO";
            case "GERMANY", "DEUTSCHLAND", "BUNDESREPUBLIK DEUTSCHLAND", "GERMANIA" -> "GERMANIA";
            case "FRANCE", "FRANCIA" -> "FRANCIA";
            case "SPAIN", "ESPANA", "SPAGNA" -> "SPAGNA";
            case "PORTUGAL", "PORTOGALLO" -> "PORTOGALLO";
            case "GREECE", "ELLAS", "GRECIA", "REPUBBLICA GRECA" -> "GRECIA";
            case "CZECH REPUBLIC" -> "REPUBBLICA CECA";
            case "SLOVAKIA" -> "SLOVACCHIA";
            case "IRELAND", "IRLANDA" -> "IRLANDA";
            case "NETHERLANDS", "HOLLAND", "PAESI BASSI", "OLANDA" -> "OLANDA";
            case "BELGIUM", "BELGIO" -> "BELGIO";
            case "AUSTRIA" -> "AUSTRIA";
            case "FINLAND", "FINLANDIA" -> "FINLANDIA";
            case "DENMARK" -> "DANIMARCA";
            case "SWEDEN", "SVEZIA" -> "SVEZIA";
            case "NORWAY", "NORVEGIA" -> "NORVEGIA";
            case "UNITED KINGDOM", "UK", "GREAT BRITAIN", "REGNO UNITO", "GRAN BRETAGNA" -> "REGNO UNITO";
            case "ROMANIA", "RUMANIA" -> "ROMANIA";
            case "POLAND", "POLONIA" -> "POLONIA";
            case "HUNGARY", "UNGHERIA" -> "UNGHERIA";
            case "BULGARIA" -> "BULGARIA";
            case "CROATIA", "CROAZIA" -> "CROAZIA";
            case "SLOVENIA" -> "SLOVENIA";
            case "ESTONIA" -> "ESTONIA";
            case "LATVIA", "LETTONIA" -> "LETTONIA";
            case "LITHUANIA", "LITUANIA" -> "LITUANIA";
            case "CHILE", "CILE" -> "CILE";
            case "MEXICO", "MEXICAN STATES" -> "MESSICO";
            case "CYPRUS", "CIPRO" -> "CIPRO";
            case "TURKEY", "TURCHIA", "TÜRKIYE" -> "TURCHIA";
            case "BRAZIL" -> "BRASILE";
            case "UNITED STATES" -> "USA";
            case "JAPAN" -> "GIAPPONE";
            case "SOUTH AFRICA" -> "SUDAFRICA";
            default -> upper;
        };
    }
}